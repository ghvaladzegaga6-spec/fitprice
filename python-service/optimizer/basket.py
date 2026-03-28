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

def price_per_gram(row):
    if row["sale_type"] == "package_pieces":
        pkg = float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0
        return float(row["price"]) / pkg
    return float(row["price"]) / 1000.0

def actual_price(row, grams):
    if row["sale_type"] == "package_pieces":
        pkg = float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0
        n = max(1, round(grams / pkg))
        return round(float(row["price"]) * n, 2), pkg * n
    return round(price_per_gram(row) * grams, 2), grams

def pick_cheapest(df, cats, used_ids, min_g=100, max_g=500):
    sub = df[df["category"].isin(cats) & ~df["id"].isin(used_ids)].copy()
    if sub.empty:
        return None
    sub["ppg"] = sub.apply(price_per_gram, axis=1)
    return sub.nsmallest(1, "ppg").iloc[0]

@router.post("/optimize")
def optimize_basket(req: BasketRequest):
    df = load_products()

    if req.included_categories:
        df = df[df["category"].isin(req.included_categories)]
    if req.excluded_categories:
        df = df[~df["category"].isin(req.excluded_categories)]

    df = df[df["price"] > 0].copy()

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

    basket = []
    used_ids = set()
    total_p = total_f = total_c = total_cal = total_price = 0.0

    def add(cats, target_cal_share, min_g=100, max_g=500):
        nonlocal total_p, total_f, total_c, total_cal, total_price
        row = pick_cheapest(df, cats, used_ids, min_g, max_g)
        if row is None:
            return
        cal100 = float(row["calories"])
        if cal100 <= 0:
            return
        wanted = (target_cal_share / cal100) * 100.0
        wanted = max(min_g, min(wanted, max_g))
        price, grams = actual_price(row, wanted)
        grams = round(grams)
        f = grams / 100.0
        p = round(float(row["protein"]) * f, 1)
        fat = round(float(row["fat"]) * f, 1)
        c = round(float(row["carbs"]) * f, 1)
        cal = round(cal100 * f, 1)
        basket.append({
            "id": int(row["id"]),
            "product": row["product"],
            "category": row["category"],
            "grams": grams,
            "price": price,
            "protein": p,
            "fat": fat,
            "carbs": c,
            "calories": cal,
            "sale_type": row["sale_type"],
            "is_promo": bool(row["is_promo"]),
        })
        used_ids.add(int(row["id"]))
        total_p += p
        total_f += fat
        total_c += c
        total_cal += cal
        total_price += price

    add(["ნედლი ხორცი", "ქათამი", "ღორი", "საქონელი"], target_cal * 0.25, 100, 600)
    add(["კვერცხი"], target_cal * 0.10, 100, 300)
    add(["ყველი"], target_cal * 0.08, 50, 200)
    add(["მარცვლეული და ბურღულეული"], target_cal * 0.15, 100, 400)
    add(["მაკარონი"], target_cal * 0.10, 100, 300)
    add(["პურ-ფუნთუშეული"], target_cal * 0.08, 100, 500)
    add(["ბოსტნეული"], target_cal * 0.10, 150, 500)
    add(["ხილი", "ციტრუსი"], target_cal * 0.07, 100, 400)
    add(["კარაქი & სპრედი"], target_cal * 0.04, 30, 150)
    add(["რძე & ნაღები", "მაწონი", "კეფირი & აირანი"], target_cal * 0.03, 100, 500)

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
    same_cat["ppg"] = same_cat.apply(price_per_gram, axis=1)
    best = same_cat.nsmallest(1, "ppg").iloc[0]
    return {"replacement": df_to_dict(pd.DataFrame([best]))[0]}
