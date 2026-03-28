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

def calc_price(row, grams: float) -> float:
    if row["sale_type"] == "package_pieces":
        pkg = float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0
        n = max(1, round(grams / pkg))
        return round(float(row["price"]) * n, 2)
    return round((float(row["price"]) / 1000.0) * grams, 2)

def calc_grams(row, wanted: float) -> float:
    if row["sale_type"] == "package_pieces":
        pkg = float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0
        n = max(1, round(wanted / pkg))
        return pkg * n
    return wanted

def nutrients(row, grams: float) -> dict:
    f = grams / 100.0
    return {
        "protein": round(float(row["protein"]) * f, 1),
        "fat": round(float(row["fat"]) * f, 1),
        "carbs": round(float(row["carbs"]) * f, 1),
        "calories": round(float(row["calories"]) * f, 1),
    }

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

    plan = [
        (["ნედლი ხორცი", "ქათამი", "ღორი", "საქონელი", "ფარშრებული"], target_cal * 0.30, 100, 500),
        (["კვერცხი"], target_cal * 0.08, 100, 300),
        (["ყველი"], target_cal * 0.07, 50, 200),
        (["მარცვლეული და ბურღულეული"], target_cal * 0.15, 100, 400),
        (["მაკარონი"], target_cal * 0.10, 100, 300),
        (["პურ-ფუნთუშეული"], target_cal * 0.08, 100, 600),
        (["ბოსტნეული"], target_cal * 0.10, 150, 500),
        (["ხილი", "ციტრუსი"], target_cal * 0.07, 100, 400),
        (["კარაქი & სპრედი"], target_cal * 0.03, 30, 150),
        (["რძე & ნაღები", "მაწონი", "კეფირი & აირანი", "იოგურტი & პუდიგრი"], target_cal * 0.02, 100, 500),
    ]

    for cats, cal_share, min_g, max_g in plan:
        if cal_share <= 0:
            continue

        sub = df[
            (df["category"].isin(cats)) &
            (~df["id"].isin(used_ids))
        ].copy()

        if sub.empty:
            continue

        sub["ppg"] = sub.apply(lambda r: float(r["price"]) / (float(r["total_package_weight"]) if r["sale_type"] == "package_pieces" and float(r["total_package_weight"]) > 0 else 1000.0), axis=1)
        best = sub.nsmallest(1, "ppg").iloc[0]

        cal100 = float(best["calories"])
        if cal100 <= 0:
            cal100 = 100.0

        wanted = (cal_share / cal100) * 100.0
        wanted = max(min_g, min(wanted, max_g))
        grams = round(calc_grams(best, wanted))
        price = calc_price(best, grams)
        n = nutrients(best, grams)

        basket.append({
            "id": int(best["id"]),
            "product": best["product"],
            "category": best["category"],
            "grams": grams,
            "price": price,
            "protein": n["protein"],
            "fat": n["fat"],
            "carbs": n["carbs"],
            "calories": n["calories"],
            "sale_type": best["sale_type"],
            "is_promo": bool(best["is_promo"]),
        })

        used_ids.add(int(best["id"]))
        total_p += n["protein"]
        total_f += n["fat"]
        total_c += n["carbs"]
        total_cal += n["calories"]
        total_price += price

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
    same_cat["ppg"] = same_cat.apply(
        lambda r: float(r["price"]) / (float(r["total_package_weight"]) if r["sale_type"] == "package_pieces" and float(r["total_package_weight"]) > 0 else 1000.0), axis=1
    )
    best = same_cat.nsmallest(1, "ppg").iloc[0]
    return {"replacement": df_to_dict(pd.DataFrame([best]))[0]}
