from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator
from typing import Optional, List
import pandas as pd
import numpy as np
from scipy.optimize import linprog
from data.loader import load_products, df_to_dict
import math

router = APIRouter()

class BasketRequest(BaseModel):
    calories: Optional[float] = Field(None, ge=500, le=10000)
    protein: Optional[float] = Field(None, ge=0, le=500)
    fat: Optional[float] = Field(None, ge=0, le=500)
    carbs: Optional[float] = Field(None, ge=0, le=1000)
    excluded_categories: Optional[List[str]] = []
    included_categories: Optional[List[str]] = []
    force_promo: Optional[List[int]] = []
    mode: str = Field("calories", pattern="^(calories|macros)$")
    calorie_ratio: Optional[dict] = None

    @validator("calories", always=True)
    def check_input(cls, v, values):
        return v

class ReplaceRequest(BaseModel):
    product_id: int
    excluded_ids: Optional[List[int]] = []

WEIGHT_MIN = 50
WEIGHT_MAX = 500
PKG_MIN = 100
PKG_MAX = 300
UNIT_MAX_RATIO = 0.40

def get_gram_price(row) -> float:
    """Price per gram"""
    if row["sale_type"] == "weight":
        return row["price"] / 1000.0
    elif row["sale_type"] == "package_pieces":
        w = row["total_package_weight"] if row["total_package_weight"] > 0 else 100
        return row["price"] / w
    return row["price"] / 100.0

def get_macro_per_gram(row, macro: str) -> float:
    return row[macro] / 100.0

def solve_basket(df: pd.DataFrame, target_cal: float, target_p: float, target_f: float, target_c: float):
    """
    Linear programming: minimize cost while matching macros.
    Variables: grams of each product to use.
    """
    n = len(df)
    if n == 0:
        return None

    # Objective: minimize total price
    prices_per_gram = np.array([get_gram_price(row) for _, row in df.iterrows()])

    # Constraints: equality on macros (with tolerance)
    # protein_per_g * x = target_p
    prot = np.array([get_macro_per_gram(row, "protein") for _, row in df.iterrows()])
    fat_ = np.array([get_macro_per_gram(row, "fat") for _, row in df.iterrows()])
    carb = np.array([get_macro_per_gram(row, "carbs") for _, row in df.iterrows()])
    cal_ = np.array([row["calories"] / 100.0 for _, row in df.iterrows()])

    # Bounds per product
    bounds = []
    for _, row in df.iterrows():
        if row["sale_type"] == "weight":
            bounds.append((WEIGHT_MIN, WEIGHT_MAX))
        elif row["sale_type"] == "package_pieces":
            w = row["total_package_weight"] if row["total_package_weight"] > 0 else 100
            bounds.append((0, w))
        else:
            bounds.append((0, 200))

    # Use inequality constraints (<=) to approximate equality within tolerance
    tol = 0.15  # 5% tolerance

    A_ub = []
    b_ub = []
    # protein <= target_p * (1+tol)
    A_ub.append(prot)
    b_ub.append(target_p * (1 + tol))
    # -protein <= -target_p * (1-tol)
    A_ub.append(-prot)
    b_ub.append(-target_p * (1 - tol))
    # fat
    A_ub.append(fat_)
    b_ub.append(target_f * (1 + tol))
    A_ub.append(-fat_)
    b_ub.append(-target_f * (1 - tol))
    # carbs
    A_ub.append(carb)
    b_ub.append(target_c * (1 + tol))
    A_ub.append(-carb)
    b_ub.append(-target_c * (1 - tol))

    result = linprog(
        c=prices_per_gram,
        A_ub=np.array(A_ub),
        b_ub=np.array(b_ub),
        bounds=bounds,
        method="highs",
        options={"disp": False}
    )

    if result.status not in [0, 1]:
        # Relax tolerance and retry
        tol = 0.15
        A_ub[1] = -prot; b_ub[1] = -target_p * (1 - tol)
        A_ub[3] = -fat_; b_ub[3] = -target_f * (1 - tol)
        A_ub[5] = -carb; b_ub[5] = -target_c * (1 - tol)
        result = linprog(
            c=prices_per_gram,
            A_ub=np.array(A_ub),
            b_ub=np.array(b_ub),
            bounds=bounds,
            method="highs",
        )

    return result

@router.post("/optimize")
def optimize_basket(req: BasketRequest):
    df = load_products()

    # Apply category filters
    if req.included_categories:
        df = df[df["category"].isin(req.included_categories)]
    if req.excluded_categories:
        df = df[~df["category"].isin(req.excluded_categories)]

    # Calculate targets
    if req.mode == "calories" and req.calories:
        ratio = req.calorie_ratio or {"carbs": 0.40, "protein": 0.30, "fat": 0.30}
        target_p = (req.calories * ratio.get("protein", 0.30)) / 4.0
        target_f = (req.calories * ratio.get("fat", 0.30)) / 9.0
        target_c = (req.calories * ratio.get("carbs", 0.40)) / 4.0
        target_cal = req.calories
    elif req.mode == "macros":
        target_p = req.protein or 0
        target_f = req.fat or 0
        target_c = req.carbs or 0
        target_cal = (target_p * 4) + (target_f * 9) + (target_c * 4)
    else:
        raise HTTPException(status_code=400, detail="Invalid input")

    if target_p <= 0 and target_f <= 0 and target_c <= 0:
        raise HTTPException(status_code=400, detail="Macros cannot all be zero")

    # Only use products with nutritional value (skip spices/vinegar/salt for macro matching)
    useful = df[(df["calories"] > 5) | (df["protein"] > 0.5)].copy()

    if len(useful) < 5:
        raise HTTPException(status_code=422, detail="Not enough products in selected categories")

    result = solve_basket(useful, target_cal, target_p, target_f, target_c)

    if result is None or result.status not in [0, 1]:
        raise HTTPException(status_code=422, detail="Optimization failed — try different categories or targets")

    # Build basket
    basket = []
    total_price = 0.0
    total_p = 0.0; total_f = 0.0; total_c = 0.0; total_cal = 0.0

    for i, (_, row) in enumerate(useful.iterrows()):
        grams = float(result.x[i])
        if grams < 10:
            continue
        grams = round(grams)
        price = get_gram_price(row) * grams
        p = get_macro_per_gram(row, "protein") * grams
        f = get_macro_per_gram(row, "fat") * grams
        c = get_macro_per_gram(row, "carbs") * grams
        cal = (row["calories"] / 100.0) * grams

        total_price += price
        total_p += p; total_f += f; total_c += c; total_cal += cal

        basket.append({
            "id": int(row["id"]),
            "product": row["product"],
            "category": row["category"],
            "grams": grams,
            "price": round(price, 2),
            "protein": round(p, 1),
            "fat": round(f, 1),
            "carbs": round(c, 1),
            "calories": round(cal, 1),
            "sale_type": row["sale_type"],
            "is_promo": bool(row["is_promo"]),
        })

    # Force include promo products if requested
    if req.force_promo:
        promo_df = df[df["id"].isin(req.force_promo)]
        existing_ids = {item["id"] for item in basket}
        for _, row in promo_df.iterrows():
            if int(row["id"]) not in existing_ids:
                grams = WEIGHT_MIN
                price = get_gram_price(row) * grams
                basket.append({
                    "id": int(row["id"]),
                    "product": row["product"],
                    "category": row["category"],
                    "grams": grams,
                    "price": round(price, 2),
                    "protein": round(get_macro_per_gram(row, "protein") * grams, 1),
                    "fat": round(get_macro_per_gram(row, "fat") * grams, 1),
                    "carbs": round(get_macro_per_gram(row, "carbs") * grams, 1),
                    "calories": round((row["calories"] / 100.0) * grams, 1),
                    "sale_type": row["sale_type"],
                    "is_promo": True,
                })

    return {
        "basket": basket,
        "totals": {
            "price": round(total_price, 2),
            "protein": round(total_p, 1),
            "fat": round(total_f, 1),
            "carbs": round(total_c, 1),
            "calories": round(total_cal, 1),
        },
        "targets": {
            "protein": round(target_p, 1),
            "fat": round(target_f, 1),
            "carbs": round(target_c, 1),
            "calories": round(target_cal, 1),
        }
    }

@router.post("/replace")
def replace_product(req: ReplaceRequest):
    df = load_products()
    product_row = df[df["id"] == req.product_id]
    if product_row.empty:
        raise HTTPException(status_code=404, detail="Product not found")

    original = product_row.iloc[0]
    # Find similar product: same category, lower or equal price, similar macros
    same_cat = df[
        (df["category"] == original["category"]) &
        (df["id"] != req.product_id) &
        (~df["id"].isin(req.excluded_ids))
    ].copy()

    if same_cat.empty:
        # Fallback: any category
        same_cat = df[
            (df["id"] != req.product_id) &
            (~df["id"].isin(req.excluded_ids))
        ].copy()

    if same_cat.empty:
        raise HTTPException(status_code=404, detail="No replacement found")

    # Score by macro similarity and price
    same_cat["macro_diff"] = (
        abs(same_cat["protein"] - original["protein"]) +
        abs(same_cat["fat"] - original["fat"]) +
        abs(same_cat["carbs"] - original["carbs"])
    )
    same_cat["price_per_100g"] = same_cat.apply(
        lambda r: get_gram_price(r) * 100, axis=1
    )
    same_cat["score"] = same_cat["macro_diff"] + same_cat["price_per_100g"] * 0.5
    best = same_cat.nsmallest(1, "score").iloc[0]

    return {"replacement": df_to_dict(pd.DataFrame([best]))[0]}
