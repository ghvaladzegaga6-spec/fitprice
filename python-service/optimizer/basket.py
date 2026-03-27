from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import pandas as pd
from data.loader import load_products, df_to_dict

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

class ReplaceRequest(BaseModel):
    product_id: int
    excluded_ids: Optional[List[int]] = []

def get_gram_price(row) -> float:
    if row["sale_type"] == "weight":
        return row["price"] / 1000.0
    elif row["sale_type"] == "package_pieces":
        w = row["total_package_weight"] if row["total_package_weight"] > 0 else 100
        return row["price"] / w
    return row["price"] / 100.0

@router.post("/optimize")
def optimize_basket(req: BasketRequest):
    df = load_products()

    if req.included_categories:
        df = df[df["category"].isin(req.included_categories)]
    if req.excluded_categories:
        df = df[~df["category"].isin(req.excluded_categories)]

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

    useful = df[
        (df["calories"] > 10) &
        (df["price"] > 0) &
        (df["category"].isin([
            "ხორცი", "ქათამი", "თევზი", "კვერცხი", "რძის პროდუქტი",
            "ყველი", "მარცვლეული და ბურღულეული", "ბოსტნეული", "ხილი",
            "პურ-ფუნთუშეული", "მაკარონი", "ნედლი ხორცი", "გაყინული თევზი",
            "მაწონი", "რძე & ნაღები", "კეფირი & აირანი", "იოგურტი & პუდიგრი"
        ]))
    ].copy()
    useful = useful.reset_index(drop=True)

    if len(useful) < 3:
        useful = df[(df["calories"] > 10) & (df["price"] > 0)].copy()
        useful = useful.reset_index(drop=True)

    useful["price_per_cal"] = useful.apply(
        lambda r: (get_gram_price(r) * 100) / r["calories"] if r["calories"] > 0 else 999,
        axis=1
    )

    categories = useful["category"].unique().tolist()
    basket = []
    total_cal = 0
    total_p = 0.0
    total_f = 0.0
    total_c = 0.0
    total_price = 0.0
    remaining_cal = target_cal

    for cat in categories:
        if remaining_cal <= 0:
            break
        cat_df = useful[useful["category"] == cat].sort_values("price_per_cal")
        if cat_df.empty:
            continue
        row = cat_df.iloc[0]
        cal_per_100g = row["calories"]
        if cal_per_100g <= 0:
            continue
        share = remaining_cal / len(categories)
        needed_grams = min((share / cal_per_100g) * 100, 400)
        needed_grams = max(needed_grams, 100)
        needed_grams = round(needed_grams)
        price = get_gram_price(row) * needed_grams
        p = (row["protein"] / 100.0) * needed_grams
        f = (row["fat"] / 100.0) * needed_grams
        c = (row["carbs"] / 100.0) * needed_grams
        cal = (cal_per_100g / 100.0) * needed_grams
        basket.append({
            "id": int(row["id"]),
            "product": row["product"],
            "category": row["category"],
            "grams": needed_grams,
            "price": round(price, 2),
            "protein": round(p, 1),
            "fat": round(f, 1),
            "carbs": round(c, 1),
            "calories": round(cal, 1),
            "sale_type": row["sale_type"],
            "is_promo": bool(row["is_promo"]),
        })
        total_price += price
        total_p += p
        total_f += f
        total_c += c
        total_cal += cal
        remaining_cal -= cal

    if not basket:
        raise HTTPException(status_code=422, detail="Could not build basket")

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
    same_cat = df[
        (df["category"] == original["category"]) &
        (df["id"] != req.product_id) &
        (~df["id"].isin(req.excluded_ids))
    ].copy()
    if same_cat.empty:
        same_cat = df[
            (df["id"] != req.product_id) &
            (~df["id"].isin(req.excluded_ids))
        ].copy()
    if same_cat.empty:
        raise HTTPException(status_code=404, detail="No replacement found")
    same_cat["price_per_100g"] = same_cat.apply(
        lambda r: get_gram_price(r) * 100, axis=1
    )
    best = same_cat.nsmallest(1, "price_per_100g").iloc[0]
    return {"replacement": df_to_dict(pd.DataFrame([best]))[0]}
