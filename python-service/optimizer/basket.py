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

class RebalanceRequest(BaseModel):
    basket: List[dict]
    removed_id: int
    target_calories: Optional[float] = None

PKG_MAX_RATIO = 0.40

def get_pkg_weight(row) -> float:
    return float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0

def price_per_gram(row) -> float:
    """
    წონითი: weight სვეტი = 1000 → ფასი 1კგ-ზე → price/1000
             weight სვეტი = 100  → ფასი 100გ-ზე → price/100
    შეკვრითი: price/package_weight
    """
    if row["sale_type"] == "package_pieces":
        return float(row["price"]) / get_pkg_weight(row)
    else:
        w = float(row.get("weight", 1000) or 1000)
        return float(row["price"]) / w

def resolve(row, wanted_grams: float):
    """
    წონითი: ზუსტი გრამები, ფასი პროპორციული
    შეკვრითი: max 40%, ფასი = მთლიანი შეკვრა
    """
    if row["sale_type"] == "package_pieces":
        pkg = get_pkg_weight(row)
        use = min(wanted_grams, pkg * PKG_MAX_RATIO)
        use = max(use, 1.0)
        use = round(use)
        price = float(row["price"])
        pct = round((use / pkg) * 100)
        note = (
            f"🛒 შეიძინე 1 შეკვრა — {pkg:.0f}გ · {price:.2f}₾  |  "
            f"✂️ გამოიყენე: {use}გ ({pct}%)"
        )
        return use, price, note
    else:
        grams = max(1, round(wanted_grams))
        w = float(row.get("weight", 1000) or 1000)
        price = round((float(row["price"]) / w) * grams, 2)
        return grams, price, None

def make_item(row, wanted_grams: float) -> dict:
    grams, price, note = resolve(row, wanted_grams)
    f = grams / 100.0
    return {
        "id": int(row["id"]),
        "product": row["product"],
        "category": row["category"],
        "grams": grams,
        "price": price,
        "protein": round(float(row["protein"]) * f, 1),
        "fat": round(float(row["fat"]) * f, 1),
        "carbs": round(float(row["carbs"]) * f, 1),
        "calories": round(float(row["calories"]) * f, 1),
        "sale_type": row["sale_type"],
        "is_promo": bool(row["is_promo"]),
        "pkg_note": note,
        "pkg_total_weight": get_pkg_weight(row) if row["sale_type"] == "package_pieces" else None,
    }

def pick_cheapest(df, cats, used_ids):
    sub = df[
        (df["category"].isin(cats)) &
        (~df["id"].isin(used_ids)) &
        (df["calories"] > 5) &
        (df["price"] > 0)
    ].copy()
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

    plan = [
        (["ნედლი ხორცი", "ქათამი", "ღორი", "საქონელი", "ფარშრებული"], 0.28),
        (["კვერცხი"], 0.07),
        (["ყველი", "მაწონი", "არაჟანი"], 0.06),
        (["მარცვლეული და ბურღულეული"], 0.14),
        (["მაკარონი"], 0.09),
        (["პურ-ფუნთუშეული"], 0.07),
        (["ბოსტნეული"], 0.12),
        (["ხილი", "ციტრუსი"], 0.06),
        (["კარაქი & სპრედი"], 0.03),
        (["რძე & ნაღები", "კეფირი & აირანი", "იოგურტი & პუდიგრი"], 0.03),
    ]

    basket = []
    used_ids = set()
    total_cal = total_p = total_f = total_c = total_price = 0.0

    for cats, share in plan:
        cal_share = target_cal * share
        row = pick_cheapest(df, cats, used_ids)
        if row is None:
            continue
        cal100 = float(row["calories"])
        if cal100 <= 0:
            continue
        wanted = (cal_share / cal100) * 100.0
        item = make_item(row, wanted)
        basket.append(item)
        used_ids.add(item["id"])
        total_p += item["protein"]
        total_f += item["fat"]
        total_c += item["carbs"]
        total_cal += item["calories"]
        total_price += item["price"]

    if not basket:
        raise HTTPException(status_code=422, detail="Could not build basket")

    # კალორიების ზუსტი დაბალანსება
    cal_diff = target_cal - total_cal
    iterations = 0
    while abs(cal_diff) > target_cal * 0.01 and iterations < 5:
        iterations += 1
        for i, item in enumerate(basket):
            row_df = df[df["id"] == item["id"]]
            if row_df.empty:
                continue
            row = row_df.iloc[0]
            if row["sale_type"] == "weight" and float(row["calories"]) > 0:
                extra = (cal_diff / float(row["calories"])) * 100.0
                new_grams = max(1, item["grams"] + extra)
                new_item = make_item(row, new_grams)
                total_cal += new_item["calories"] - item["calories"]
                total_p += new_item["protein"] - item["protein"]
                total_f += new_item["fat"] - item["fat"]
                total_c += new_item["carbs"] - item["carbs"]
                total_price += new_item["price"] - item["price"]
                basket[i] = new_item
                cal_diff = target_cal - total_cal
                break

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

@router.post("/rebalance")
def rebalance_basket(req: RebalanceRequest):
    remaining = [item for item in req.basket if item["id"] != req.removed_id]
    if not remaining:
        return {"basket": [], "totals": None, "message": "კალათი ცარიელია"}

    target_cal = req.target_calories or sum(item["calories"] for item in req.basket)
    current_cal = sum(item["calories"] for item in remaining)
    deficit_pct = (target_cal - current_cal) / target_cal if target_cal > 0 else 0

    if deficit_pct > 0.40:
        totals = {
            "price": round(sum(i["price"] for i in remaining), 2),
            "protein": round(sum(i["protein"] for i in remaining), 1),
            "fat": round(sum(i["fat"] for i in remaining), 1),
            "carbs": round(sum(i["carbs"] for i in remaining), 1),
            "calories": round(current_cal, 1),
        }
        return {
            "basket": remaining, "totals": totals,
            "message": f"⚠️ ამ პროდუქტის წაშლით კარგავთ კალორიების {round(deficit_pct*100)}%-ს. გირჩევთ ახალი კალათის გენერაციას."
        }

    df = load_products()
    scale = min(target_cal / current_cal, 1.5) if current_cal > 0 else 1.0

    new_basket = []
    for item in remaining:
        row_df = df[df["id"] == item["id"]]
        if row_df.empty:
            new_basket.append(item)
            continue
        row = row_df.iloc[0]
        new_item = make_item(row, item["grams"] * scale)
        new_basket.append(new_item)

    totals = {
        "price": round(sum(i["price"] for i in new_basket), 2),
        "protein": round(sum(i["protein"] for i in new_basket), 1),
        "fat": round(sum(i["fat"] for i in new_basket), 1),
        "carbs": round(sum(i["carbs"] for i in new_basket), 1),
        "calories": round(sum(i["calories"] for i in new_basket), 1),
    }
    return {"basket": new_basket, "totals": totals, "message": None}

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
        (~df["id"].isin(req.excluded_ids)) &
        (df["calories"] > 5)
    ].copy()
    if same_cat.empty:
        same_cat = df[
            (df["id"] != req.product_id) &
            (~df["id"].isin(req.excluded_ids)) &
            (df["calories"] > 5)
        ].copy()
    if same_cat.empty:
        raise HTTPException(status_code=404, detail="No replacement found")
    same_cat["ppg"] = same_cat.apply(price_per_gram, axis=1)
    best = same_cat.nsmallest(1, "ppg").iloc[0]
    return {"replacement": df_to_dict(pd.DataFrame([best]))[0]}
