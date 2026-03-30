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

# ══════════════════════════════════════════════════════════════
# კატეგორიების მაქსიმუმ გრამები თითოეულ დიაპაზონში
# ══════════════════════════════════════════════════════════════

LIMITS = {
    "500-1000": {
        "არაჟანი": 15, "ბოსტნეული": 200, "გაყინული თევზი": 100,
        "ზღვის პროდუქტები": 100, "თაფლი, მურაბა & ჯემი": 10,
        "იოგურტი & პუდიგრი": 150, "კარაქი & სპრედი": 5,
        "კეფირი & აირანი": 200, "კვერცხი": 120,
        "კონსერვები": 70, "მაიონეზი & სოუსები": 10,
        "მაკარონი": 50, "მარილი": 3, "მარინადი": 20,
        "მარცვლეული და ბურღულეული": 50, "მაწონი": 150,
        "მწვანილები": 20, "ნახევარფაბრიკატები": 70,
        "ნედლი ხორცი": 100, "პურ-ფუნთუშეული": 50,
        "რძე & ნაღები": 150, "რძის სიკვიტი": 30,
        "სასმელები": 250, "საქონელი": 100,
        "საცხობი საშუალებები": 10, "სიმინდის ფანტელი": 30,
        "სნექი": 25, "სწრაფად მოსამზადებელი საკვები": 50,
        "ტკბილეული და ნაყინი": 20, "ფანტელი და მიუსელი": 30,
        "ფარშრებული": 100, "ქათამი": 120, "ღორი": 80,
        "ყველი": 30, "შაქარი": 10, "შებოლილი თევზი": 60,
        "შესქელებული რძე": 20, "ციტრუსი": 200,
        "ძეხვეული": 50, "ძმარი": 10, "ხილი": 200,
    },
    "1000-1500": {
        "არაჟანი": 20, "ბოსტნეული": 300, "გაყინული თევზი": 120,
        "ზღვის პროდუქტები": 120, "თაფლი, მურაბა & ჯემი": 15,
        "იოგურტი & პუდიგრი": 200, "კარაქი & სპრედი": 10,
        "კეფირი & აირანი": 250, "კვერცხი": 120,
        "კონსერვები": 100, "მაიონეზი & სოუსები": 15,
        "მაკარონი": 70, "მარილი": 4, "მარინადი": 30,
        "მარცვლეული და ბურღულეული": 80, "მაწონი": 200,
        "მწვანილები": 30, "ნახევარფაბრიკატები": 100,
        "ნედლი ხორცი": 150, "პურ-ფუნთუშეული": 80,
        "რძე & ნაღები": 200, "რძის სიკვიტი": 40,
        "სასმელები": 400, "საქონელი": 150,
        "საცხობი საშუალებები": 15, "სიმინდის ფანტელი": 50,
        "სნექი": 40, "სწრაფად მოსამზადებელი საკვები": 80,
        "ტკბილეული და ნაყინი": 30, "ფანტელი და მიუსელი": 50,
        "ფარშრებული": 150, "ქათამი": 150, "ღორი": 120,
        "ყველი": 50, "შაქარი": 15, "შებოლილი თევზი": 80,
        "შესქელებული რძე": 30, "ციტრუსი": 250,
        "ძეხვეული": 70, "ძმარი": 15, "ხილი": 250,
    },
    "1500-2500": {
        "არაჟანი": 30, "ბოსტნეული": 350, "გაყინული თევზი": 150,
        "ზღვის პროდუქტები": 150, "თაფლი, მურაბა & ჯემი": 25,
        "იოგურტი & პუდიგრი": 250, "კარაქი & სპრედი": 15,
        "კეფირი & აირანი": 300, "კვერცხი": 180,
        "კონსერვები": 120, "მაიონეზი & სოუსები": 20,
        "მაკარონი": 100, "მარილი": 5, "მარინადი": 40,
        "მარცვლეული და ბურღულეული": 120, "მაწონი": 250,
        "მწვანილები": 40, "ნახევარფაბრიკატები": 120,
        "ნედლი ხორცი": 200, "პურ-ფუნთუშეული": 120,
        "რძე & ნაღები": 250, "რძის სიკვიტი": 50,
        "სასმელები": 500, "საქონელი": 200,
        "საცხობი საშუალებები": 20, "სიმინდის ფანტელი": 70,
        "სნექი": 50, "სწრაფად მოსამზადებელი საკვები": 100,
        "ტკბილეული და ნაყინი": 40, "ფანტელი და მიუსელი": 70,
        "ფარშრებული": 200, "ქათამი": 200, "ღორი": 150,
        "ყველი": 70, "შაქარი": 25, "შებოლილი თევზი": 100,
        "შესქელებული რძე": 40, "ციტრუსი": 300,
        "ძეხვეული": 100, "ძმარი": 20, "ხილი": 300,
    },
    "2500+": {
        "არაჟანი": 40, "ბოსტნეული": 400, "გაყინული თევზი": 200,
        "ზღვის პროდუქტები": 200, "თაფლი, მურაბა & ჯემი": 30,
        "იოგურტი & პუდიგრი": 300, "კარაქი & სპრედი": 20,
        "კეფირი & აირანი": 400, "კვერცხი": 240,
        "კონსერვები": 150, "მაიონეზი & სოუსები": 25,
        "მაკარონი": 130, "მარილი": 5, "მარინადი": 50,
        "მარცვლეული და ბურღულეული": 150, "მაწონი": 300,
        "მწვანილები": 50, "ნახევარფაბრიკატები": 150,
        "ნედლი ხორცი": 250, "პურ-ფუნთუშეული": 150,
        "რძე & ნაღები": 300, "რძის სიკვიტი": 60,
        "სასმელები": 700, "საქონელი": 250,
        "საცხობი საშუალებები": 25, "სიმინდის ფანტელი": 100,
        "სნექი": 60, "სწრაფად მოსამზადებელი საკვები": 120,
        "ტკბილეული და ნაყინი": 60, "ფანტელი და მიუსელი": 100,
        "ფარშრებული": 250, "ქათამი": 250, "ღორი": 200,
        "ყველი": 100, "შაქარი": 30, "შებოლილი თევზი": 120,
        "შესქელებული რძე": 50, "ციტრუსი": 350,
        "ძეხვეული": 120, "ძმარი": 20, "ხილი": 350,
    },
}

def get_limit_key(cal: float) -> str:
    if cal <= 1000: return "500-1000"
    elif cal <= 1500: return "1000-1500"
    elif cal <= 2500: return "1500-2500"
    else: return "2500+"

def get_max_grams(cat: str, cal: float) -> float:
    key = get_limit_key(cal)
    return float(LIMITS[key].get(cat, 200))

def get_plan(target_cal: float) -> list:
    """კვების გეგმა დიაპაზონის მიხედვით — (კატეგორიები, წილი)"""
    if target_cal <= 1000:
        return [
            (["მარცვლეული და ბურღულეული"], 0.15),
            (["ქათამი", "ნედლი ხორცი", "საქონელი", "ფარშრებული"], 0.20),
            (["კვერცხი"], 0.10),
            (["კონსერვები"], 0.08),
            (["ბოსტნეული"], 0.18),
            (["ხილი", "ციტრუსი"], 0.18),
            (["მაწონი", "იოგურტი & პუდიგრი", "კეფირი & აირანი"], 0.08),
            (["პურ-ფუნთუშეული"], 0.03),
        ]
    elif target_cal <= 1500:
        return [
            (["მარცვლეული და ბურღულეული"], 0.14),
            (["ქათამი", "ნედლი ხორცი", "საქონელი"], 0.18),
            (["კვერცხი"], 0.08),
            (["კონსერვები"], 0.07),
            (["ბოსტნეული"], 0.16),
            (["ხილი", "ციტრუსი"], 0.14),
            (["მაწონი", "იოგურტი & პუდიგრი"], 0.10),
            (["პურ-ფუნთუშეული"], 0.06),
            (["ყველი"], 0.04),
            (["რძე & ნაღები", "კეფირი & აირანი"], 0.03),
        ]
    elif target_cal <= 2500:
        return [
            (["მარცვლეული და ბურღულეული"], 0.13),
            (["მაკარონი"], 0.08),
            (["ქათამი", "ნედლი ხორცი", "საქონელი"], 0.18),
            (["კვერცხი"], 0.07),
            (["კონსერვები"], 0.05),
            (["ბოსტნეული"], 0.14),
            (["ხილი", "ციტრუსი"], 0.10),
            (["მაწონი"], 0.07),
            (["პურ-ფუნთუშეული"], 0.06),
            (["ყველი"], 0.04),
            (["რძე & ნაღები"], 0.04),
            (["კარაქი & სპრედი"], 0.02),
        ]
    else:
        return [
            (["მარცვლეული და ბურღულეული"], 0.12),
            (["მაკარონი"], 0.08),
            (["ქათამი", "ნედლი ხორცი", "საქონელი"], 0.17),
            (["კვერცხი"], 0.07),
            (["კონსერვები"], 0.05),
            (["ბოსტნეული"], 0.12),
            (["ხილი", "ციტრუსი"], 0.09),
            (["მაწონი"], 0.06),
            (["პურ-ფუნთუშეული"], 0.06),
            (["ყველი"], 0.04),
            (["რძე & ნაღები"], 0.05),
            (["კარაქი & სპრედი"], 0.02),
            (["ძეხვეული", "ფარშრებული"], 0.04),
            (["ფანტელი და მიუსელი", "სიმინდის ფანტელი"], 0.03),
        ]


def get_pkg_weight(row) -> float:
    return float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0

def price_per_gram(row) -> float:
    if row["sale_type"] == "package_pieces":
        return float(row["price"]) / get_pkg_weight(row)
    w = float(row.get("weight", 1000) or 1000)
    return float(row["price"]) / w

def resolve(row, wanted_grams: float, max_g: float):
    if row["sale_type"] == "package_pieces":
        pkg = get_pkg_weight(row)
        use = min(wanted_grams, pkg * PKG_MAX_RATIO, max_g)
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
        grams = max(1, min(round(wanted_grams), max_g))
        w = float(row.get("weight", 1000) or 1000)
        price = round((float(row["price"]) / w) * grams, 2)
        return grams, price, None

def make_item(row, wanted_grams: float, max_g: float = 500) -> dict:
    grams, price, note = resolve(row, wanted_grams, max_g)
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

    plan = get_plan(target_cal)
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

        # max_g კატეგორიის ლიმიტიდან
        cat = row["category"]
        max_g = get_max_grams(cat, target_cal)

        # საჭირო გრამები კალ-წილისთვის
        wanted = (cal_share / cal100) * 100.0
        # შეზღუდვა max-ზე
        wanted = min(wanted, max_g)

        item = make_item(row, wanted, max_g)
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
    while abs(cal_diff) > target_cal * 0.015 and iterations < 8:
        iterations += 1
        improved = False
        for i, item in enumerate(basket):
            row_df = df[df["id"] == item["id"]]
            if row_df.empty:
                continue
            row = row_df.iloc[0]
            if row["sale_type"] != "weight" or float(row["calories"]) <= 0:
                continue
            cat = row["category"]
            max_g = get_max_grams(cat, target_cal)
            if item["grams"] >= max_g and cal_diff > 0:
                continue
            extra = (cal_diff / float(row["calories"])) * 100.0
            new_grams = max(1, min(item["grams"] + extra, max_g))
            if abs(new_grams - item["grams"]) < 0.5:
                continue
            new_item = make_item(row, new_grams, max_g)
            total_cal += new_item["calories"] - item["calories"]
            total_p += new_item["protein"] - item["protein"]
            total_f += new_item["fat"] - item["fat"]
            total_c += new_item["carbs"] - item["carbs"]
            total_price += new_item["price"] - item["price"]
            basket[i] = new_item
            cal_diff = target_cal - total_cal
            improved = True
            break
        if not improved:
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
        max_g = get_max_grams(row["category"], target_cal)
        new_item = make_item(row, item["grams"] * scale, max_g)
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
