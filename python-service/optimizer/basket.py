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
    target_protein: Optional[float] = None
    target_fat: Optional[float] = None
    target_carbs: Optional[float] = None

# ── კვების ჯგუფები ──────────────────────────────────────────────
PROTEIN_CATS = ["ნედლი ხორცი", "ქათამი", "ღორი", "საქონელი", "ფარშრებული",
                "გაყინული თევზი", "შებოლილი თევზი", "ძეხვეული"]
CARB_CATS    = ["მარცვლეული და ბურღულეული", "მაკარონი", "პურ-ფუნთუშეული",
                "ბოსტნეული", "ხილი", "ციტრუსი"]
DAIRY_CATS   = ["კვერცხი", "ყველი", "მაწონი", "არაჟანი",
                "კეფირი & აირანი", "იოგურტი & პუდიგრი", "რძე & ნაღები"]
FAT_CATS     = ["კარაქი & სპრედი"]

# package_pieces-ისთვის max 40% გამოყენება
PKG_MAX_RATIO = 0.40

def get_pkg_weight(row) -> float:
    w = float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0
    return w

def max_grams(row) -> float:
    if row["sale_type"] == "package_pieces":
        return get_pkg_weight(row) * PKG_MAX_RATIO
    return 500.0

def min_grams(row) -> float:
    if row["sale_type"] == "package_pieces":
        return get_pkg_weight(row) * 0.10
    return 80.0

def calc_price(row, grams: float) -> float:
    if row["sale_type"] == "package_pieces":
        pkg = get_pkg_weight(row)
        n = max(1, round(grams / pkg))
        return round(float(row["price"]) * n, 2)
    return round((float(row["price"]) / 1000.0) * grams, 2)

def calc_grams_pkg(row, wanted: float) -> float:
    """package_pieces-ისთვის გრამების დამრგვალება"""
    if row["sale_type"] == "package_pieces":
        pkg = get_pkg_weight(row)
        # max 40% შეზღუდვა
        max_g = pkg * PKG_MAX_RATIO
        wanted = min(wanted, max_g)
        return max(min_grams(row), wanted)
    return wanted

def nutrients(row, grams: float) -> dict:
    f = grams / 100.0
    return {
        "protein":  round(float(row["protein"])  * f, 1),
        "fat":      round(float(row["fat"])       * f, 1),
        "carbs":    round(float(row["carbs"])     * f, 1),
        "calories": round(float(row["calories"])  * f, 1),
    }

def pick_best(df: pd.DataFrame, cats: list, used_ids: set) -> Optional[pd.Series]:
    sub = df[
        (df["category"].isin(cats)) &
        (~df["id"].isin(used_ids)) &
        (df["calories"] > 10) &
        (df["price"] > 0)
    ].copy()
    if sub.empty:
        return None
    sub["ppg"] = sub.apply(
        lambda r: float(r["price"]) / (get_pkg_weight(r) if r["sale_type"] == "package_pieces" else 1000.0),
        axis=1
    )
    return sub.nsmallest(1, "ppg").iloc[0]

def build_item(row, grams: float) -> dict:
    grams = round(calc_grams_pkg(row, grams))
    price = calc_price(row, grams)
    n = nutrients(row, grams)
    pkg_note = None
    if row["sale_type"] == "package_pieces":
        pkg = get_pkg_weight(row)
        pct = round((grams / pkg) * 100)
        pkg_note = f"შეიძინე 1 შეკვრა ({pkg:.0f}გ), გამოიყენე {grams}გ ({pct}%)"
    return {
        "id":        int(row["id"]),
        "product":   row["product"],
        "category":  row["category"],
        "grams":     grams,
        "price":     price,
        "protein":   n["protein"],
        "fat":       n["fat"],
        "carbs":     n["carbs"],
        "calories":  n["calories"],
        "sale_type": row["sale_type"],
        "is_promo":  bool(row["is_promo"]),
        "pkg_note":  pkg_note,
        "pkg_total_weight": get_pkg_weight(row) if row["sale_type"] == "package_pieces" else None,
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
        target_p   = (req.calories * ratio.get("protein", 0.30)) / 4.0
        target_f   = (req.calories * ratio.get("fat",     0.30)) / 9.0
        target_c   = (req.calories * ratio.get("carbs",   0.40)) / 4.0
        target_cal = req.calories
    elif req.mode == "macros":
        target_p   = req.protein or 0
        target_f   = req.fat     or 0
        target_c   = req.carbs   or 0
        target_cal = (target_p * 4) + (target_f * 9) + (target_c * 4)
    else:
        raise HTTPException(status_code=400, detail="Invalid input")

    # ── კვების გეგმა: (კატეგორიები, კალ-წილი, min_g, max_g) ──
    plan = [
        (["ნედლი ხორცი", "ქათამი", "ღორი", "საქონელი", "ფარშრებული"], 0.28, 50, 350),
        (["კვერცხი"], 0.07, 25, 150),
        (["ყველი", "მაწონი", "არაჟანი"], 0.06, 20, 100),
        (["მარცვლეული და ბურღულეული"], 0.14, 30, 200),
        (["მაკარონი"], 0.09, 30, 150),
        (["პურ-ფუნთუშეული"], 0.07, 30, 200),
        (["ბოსტნეული"], 0.12, 50, 300),
        (["ხილი", "ციტრუსი"], 0.06, 30, 200),
        (["კარაქი & სპრედი"], 0.03, 10, 40),
        (["რძე & ნაღები", "კეფირი & აირანი", "იოგურტი & პუდიგრი"], 0.03, 30, 150),
    ]

    basket = []
    used_ids = set()
    total_cal = total_p = total_f = total_c = total_price = 0.0

    for cats, cal_share, plan_min, plan_max in plan:
        if cal_share <= 0:
            continue
        row = pick_best(df, cats, used_ids)
        if row is None:
            continue

        cal100 = float(row["calories"])
        if cal100 <= 0:
            continue

        wanted = (cal_share / cal100) * 100.0
        wanted = max(plan_min, min(wanted, plan_max))

        # package პროდუქტისთვის max 40%
        if row["sale_type"] == "package_pieces":
            pkg = get_pkg_weight(row)
            wanted = min(wanted, pkg * PKG_MAX_RATIO)
            wanted = max(wanted, pkg * 0.10)

        item = build_item(row, wanted)
        basket.append(item)
        used_ids.add(item["id"])
        total_p     += item["protein"]
        total_f     += item["fat"]
        total_c     += item["carbs"]
        total_cal   += item["calories"]
        total_price += item["price"]

    if not basket:
        raise HTTPException(status_code=422, detail="Could not build basket")

    return {
        "basket": basket,
        "totals": {
            "price":    round(total_price, 2),
            "protein":  round(total_p, 1),
            "fat":      round(total_f, 1),
            "carbs":    round(total_c, 1),
            "calories": round(total_cal, 1),
        },
        "targets": {
            "protein":  round(target_p, 1),
            "fat":      round(target_f, 1),
            "carbs":    round(target_c, 1),
            "calories": round(target_cal, 1),
        }
    }

@router.post("/rebalance")
def rebalance_basket(req: RebalanceRequest):
    """პროდუქტის წაშლის შემდეგ ბალანსის გადანაწილება"""
    remaining = [item for item in req.basket if item["id"] != req.removed_id]

    if not remaining:
        return {"basket": [], "message": "კალათი ცარიელია"}

    # სამიზნე კალორიები
    target_cal = req.target_calories or sum(item["calories"] for item in req.basket)
    current_cal = sum(item["calories"] for item in remaining)
    deficit = target_cal - current_cal

    if deficit <= 0:
        return {"basket": remaining, "message": None}

    # დეფიციტის პროცენტი
    deficit_pct = deficit / target_cal

    if deficit_pct > 0.40:
        return {
            "basket": remaining,
            "message": f"⚠️ ამ პროდუქტის წაშლით კარგავთ კალორიების {round(deficit_pct*100)}%-ს. გირჩევთ ახალი კალათის გენერაციას."
        }

    # ბალანსური გადანაწილება — ყველა პროდუქტი თანაბრად
    df = load_products()
    scale = target_cal / current_cal if current_cal > 0 else 1.0
    scale = min(scale, 1.5)  # max 50% ზრდა

    new_basket = []
    for item in remaining:
        row = df[df["id"] == item["id"]]
        if row.empty:
            new_basket.append(item)
            continue
        row = row.iloc[0]

        new_grams = item["grams"] * scale

        # package შეზღუდვა
        if row["sale_type"] == "package_pieces":
            pkg = get_pkg_weight(row)
            new_grams = min(new_grams, pkg * PKG_MAX_RATIO)

        new_grams = max(50, min(new_grams, 600))
        new_item = build_item(row, new_grams)
        new_basket.append(new_item)

    new_total = sum(i["calories"] for i in new_basket)

    return {
        "basket": new_basket,
        "totals": {
            "price":    round(sum(i["price"]   for i in new_basket), 2),
            "protein":  round(sum(i["protein"] for i in new_basket), 1),
            "fat":      round(sum(i["fat"]     for i in new_basket), 1),
            "carbs":    round(sum(i["carbs"]   for i in new_basket), 1),
            "calories": round(new_total, 1),
        },
        "message": None
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
        (~df["id"].isin(req.excluded_ids)) &
        (df["calories"] > 10)
    ].copy()
    if same_cat.empty:
        same_cat = df[
            (df["id"] != req.product_id) &
            (~df["id"].isin(req.excluded_ids)) &
            (df["calories"] > 10)
        ].copy()
    if same_cat.empty:
        raise HTTPException(status_code=404, detail="No replacement found")
    same_cat["ppg"] = same_cat.apply(
        lambda r: float(r["price"]) / (get_pkg_weight(r) if r["sale_type"] == "package_pieces" else 1000.0),
        axis=1
    )
    best = same_cat.nsmallest(1, "ppg").iloc[0]
    return {"replacement": df_to_dict(pd.DataFrame([best]))[0]}
