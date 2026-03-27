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

def get_price(row, grams: float) -> float:
    if row["sale_type"] == "package_pieces":
        pkg_weight = row["total_package_weight"] if row["total_package_weight"] > 0 else 100
        num_packages = max(1, round(grams / pkg_weight))
        return row["price"] * num_packages
    else:
        return (row["price"] / 1000.0) * grams

def get_nutrients(row, grams: float):
    factor = grams / 100.0
    return {
        "protein": round(row["protein"] * factor, 1),
        "fat": round(row["fat"] * factor, 1),
        "carbs": round(row["carbs"] * factor, 1),
        "calories": round(row["calories"] * factor, 1),
    }

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

    useful = df[(df["calories"] > 10) & (df["price"] > 0)].copy()
    useful = useful.reset_index(drop=True)

    if len(useful) < 3:
        raise HTTPException(status_code=422, detail="Not enough products")

    useful["cal_per_lari"] = useful.apply(
        lambda r: (r["calories"] / 100.0 * 100) / (r["price"] / (r["total_package_weight"] if r["sale_type"] == "package_pieces" and r["total_package_weight"] > 0 else 1000) * 100)
        if r["price"] > 0 else 0,
        axis=1
    )

    basket = []
    remaining_p = target_p
    remaining_f = target_f
    remaining_c = target_c
    remaining_cal = target_cal
    total_price = 0.0
    total_p = 0.0
    total_f = 0.0
    total_c = 0.0
    total_cal = 0.0
    used_ids = set()

    protein_cats = ["ნედლი ხორცი", "ქათამი", "კვერცხი", "ყველი", "თევზი", "გაყინული თევზი", "ზღვის პროდუქტები"]
    fat_cats = ["კარაქი & სპრედი", "მაიონეზი & სოუსები"]
    carb_cats = ["მარცვლეული და ბურღულეული", "მაკარონი", "პურ-ფუნთუშეული", "ბოსტნეული", "ხილი"]

    def add_product(cat_list, target_nutrient, nutrient_key, grams_min=100, grams_max=500):
        nonlocal remaining_cal, remaining_p, remaining_f, remaining_c
        nonlocal total_price, total_p, total_f, total_c, total_cal

        candidates = useful[
            (useful["category"].isin(cat_list)) &
            (~useful["id"].isin(used_ids)) &
            (useful[nutrient_key] > 0)
        ].copy()

        if candidates.empty:
            return

        candidates["score"] = candidates[nutrient_key] / candidates["price"]
        best = candidates.nlargest(1, "score").iloc[0]

        if best["calories"] <= 0:
            return

        needed_grams = (target_nutrient / (best[nutrient_key] / 100.0))
        needed_grams = max(grams_min, min(needed_grams, grams_max))

        if best["sale_type"] == "package_pieces":
            pkg = best["total_package_weight"] if best["total_package_weight"] > 0 else 100
            needed_grams = max(pkg, round(needed_grams / pkg) * pkg)

        needed_grams = round(needed_grams)
        price = get_price(best, needed_grams)
        nuts = get_nutrients(best, needed_grams)

        basket.append({
            "id": int(best["id"]),
            "product": best["product"],
            "category": best["category"],
            "grams": needed_grams,
            "price": round(price, 2),
            "protein": nuts["protein"],
            "fat": nuts["fat"],
            "carbs": nuts["carbs"],
            "calories": nuts["calories"],
            "sale_type": best["sale_type"],
            "is_promo": bool(best["is_promo"]),
        })

        used_ids.add(int(best["id"]))
        total_price += price
        total_p += nuts["protein"]
        total_f += nuts["fat"]
        total_c += nuts["carbs"]
        total_cal += nuts["calories"]
        remaining_p = max(0, target_p - total_p)
        remaining_f = max(0, target_f - total_f)
        remaining_c = max(0, target_c - total_c)
        remaining_cal = max(0, target_cal - total_cal)

    add_product(protein_cats, target_p * 0.6, "protein", 100, 600)
    add_product(protein_cats, target_p * 0.4, "protein", 100, 400)
    add_product(carb_cats, target_c * 0.5, "carbs", 100, 500)
    add_product(carb_cats, target_c * 0.3, "carbs", 100, 400)
    add_product(carb_cats, target_c * 0.2, "carbs", 100, 300)
    add_product(fat_cats, target_f * 0.5, "fat", 50, 200)

    if remaining_cal > 100:
        extra = useful[
            (~useful["id"].isin(used_ids)) &
            (useful["calories"] > 20)
        ].copy()
        if not extra.empty:
            extra["score"] = extra["calories"] / extra["price"]
            best = extra.nlargest(1, "score").iloc[0]
            needed_grams = (remaining_cal / (best["calories"] / 100.0))
            needed_grams = max(100, min(needed_grams, 400))
            if best["sale_type"] == "package_pieces":
                pkg = best["total_package_weight"] if best["total_package_weight"] > 0 else 100
                needed_grams = max(pkg, round(needed_grams / pkg) * pkg)
            needed_grams = round(needed_grams)
            price = get_price(best, needed_grams)
            nuts = get_nutrients(best, needed_grams)
            basket.append({
                "id": int(best["id"]),
                "product": best["product"],
                "category": best["category"],
                "grams": needed_grams,
                "price": round(price, 2),
                "protein": nuts["protein"],
                "fat": nuts["fat"],
                "carbs": nuts["carbs"],
                "calories": nuts["calories"],
                "sale_type": best["sale_type"],
                "is_promo": bool(best["is_promo"]),
            })
            total_price += price
            total_p += nuts["protein"]
            total_f += nuts["fat"]
            total_c += nuts["carbs"]
            total_cal += nuts["calories"]

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
        lambda r: (r["price"] / (r["total_package_weight"] if r["sale_type"] == "package_pieces" and r["total_package_weight"] > 0 else 1000)) * 100,
        axis=1
    )
    best = same_cat.nsmallest(1, "price_per_100g").iloc[0]
    return {"replacement": df_to_dict(pd.DataFrame([best]))[0]}
