from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import pandas as pd
import math
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
    vegan_only: bool = False

class ReplaceRequest(BaseModel):
    product_id: int
    excluded_ids: Optional[List[int]] = []
    target_calories: Optional[float] = None
    new_category: Optional[str] = None
    sort_by_price: str = Field("asc", pattern="^(asc|desc)$")
    vegan_only: bool = False

class RebalanceRequest(BaseModel):
    basket: List[dict]
    removed_id: int
    target_calories: Optional[float] = None

PKG_MAX_RATIO = 0.40

GROUP_A = ["ბოსტნეული", "მწვანილები", "ხილი", "ციტრუსი"]
GROUP_B = ["მაკარონი", "მარცვლეული და ბურღულეული", "პურ-ფუნთუშეული",
           "ფანტელი და მიუსელი", "სიმინდის ფანტელი"]
GROUP_C = ["ქათამი", "ნედლი ხორცი", "საქონელი", "ღორი", "ფარშრებული",
           "გაყინული თევზი", "ზღვის პროდუქტები", "შებოლილი თევზი",
           "კვერცხი", "კონსერვები"]
GROUP_D = ["იოგურტი & პუდიგრი", "მაწონი", "კეფირი & აირანი",
           "რძე & ნაღები", "ყველი", "რძის სიკვიტი"]
GROUP_E = ["არაჟანი", "კარაქი & სპრედი", "მაიონეზი & სოუსები",
           "შაქარი", "თაფლი, მურაბა & ჯემი", "ტკბილეული და ნაყინი",
           "შესქელებული რძე", "ძეხვეული", "სნექი",
           "სწრაფად მოსამზადებელი საკვები"]
GROUP_F = ["მარილი", "მარინადი", "ძმარი", "საცხობი საშუალებები", "სასმელები"]

def cat_group(cat: str) -> str:
    if cat in GROUP_A: return "A"
    if cat in GROUP_B: return "B"
    if cat in GROUP_C: return "C"
    if cat in GROUP_D: return "D"
    if cat in GROUP_E: return "E"
    if cat in GROUP_F: return "F"
    return "C"

def calc_n(K: float) -> int:
    return min(8, max(2, math.floor(K / 500) + 2))

def get_groups_for_n(N: int) -> list:
    groups = []
    if N >= 2: groups += ["B", "C"]
    if N >= 3: groups += ["A"]
    if N >= 4: groups += ["D"]
    if N >= 5: groups += ["A"]
    if N >= 6: groups += ["D"]
    if N >= 7: groups += ["E"]
    if N >= 8: groups += ["C"]
    return groups[:N]

def get_cats_for_group(group: str) -> list:
    return {"A": GROUP_A, "B": GROUP_B, "C": GROUP_C,
            "D": GROUP_D, "E": GROUP_E, "F": GROUP_F}.get(group, GROUP_C)

def get_pkg_weight(row) -> float:
    return float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0

def price_per_gram(row) -> float:
    if row["sale_type"] == "package_pieces":
        return float(row["price"]) / get_pkg_weight(row)
    w = float(row.get("weight", 1000) or 1000) if "weight" in row.index else 1000.0
    return float(row["price"]) / w

def get_row_limits(row) -> tuple:
    """min/max გრამები CSV-დან"""
    mn = float(row.get("min_g", 50) or 50)
    mx = float(row.get("max_g", 200) or 200)
    return mn, mx

def get_min_to_buy(row) -> float:
    """min_weight_to_buy — მინიმალური შეძენა"""
    return float(row.get("min_weight_to_buy", 0) or 0)

def resolve(row, wanted: float) -> tuple:
    mn, mx = get_row_limits(row)
    min_buy = get_min_to_buy(row)
    buy_note = None

    if row["sale_type"] == "package_pieces":
        pkg = get_pkg_weight(row)
        use = min(wanted, pkg * PKG_MAX_RATIO, mx)
        use = max(round(use), max(1, round(mn)))
        price = float(row["price"])
        pct = round((use / pkg) * 100)
        note = (f"🛒 შეიძინე 1 შეკვრა — {pkg:.0f}გ · {price:.2f}₾  |  "
                f"✂️ გამოიყენე: {use}გ ({pct}%)")
        return use, price, note, None
    else:
        grams = max(mn, min(round(wanted), mx))
        # min_weight_to_buy შეზღუდვა
        actual_buy = grams
        if min_buy > 0 and grams < min_buy:
            actual_buy = min_buy
            buy_note = f"⚠️ მინ. შეძენა: {min_buy:.0f}გ — გამოიყენე {grams:.0f}გ"
        w = 1000.0
        if hasattr(row, 'index') and "weight" in row.index:
            w = float(row["weight"] or 1000)
        price = round((float(row["price"]) / w) * actual_buy, 2)
        return grams, price, None, buy_note

def make_item(row, wanted: float) -> dict:
    grams, price, pkg_note, buy_note = resolve(row, wanted)
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
        "is_vegan": bool(row.get("is_vegan", False)),
        "pkg_note": pkg_note,
        "buy_note": buy_note,
        "pkg_total_weight": get_pkg_weight(row) if row["sale_type"] == "package_pieces" else None,
        "owned": False,
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

def balance_to_target(basket, df, target_cal, total_cal, total_p, total_f, total_c, total_price):
    for _ in range(15):
        cal_diff = target_cal - total_cal
        if abs(cal_diff) <= target_cal * 0.01:
            break
        improved = False
        for i, item in enumerate(basket):
            row_df = df[df["id"] == item["id"]]
            if row_df.empty:
                continue
            row = row_df.iloc[0]
            if float(row["calories"]) <= 0:
                continue
            mn, mx = get_row_limits(row)
            if row["sale_type"] == "package_pieces":
                pkg = get_pkg_weight(row)
                mx = min(mx, pkg * PKG_MAX_RATIO)
            if cal_diff > 0 and item["grams"] >= mx:
                continue
            if cal_diff < 0 and item["grams"] <= mn:
                continue
            extra = (cal_diff / float(row["calories"])) * 100.0
            new_grams = item["grams"] + extra
            new_grams = max(mn, min(new_grams, mx))
            if abs(new_grams - item["grams"]) < 0.5:
                continue
            new_item = make_item(row, new_grams)
            total_cal += new_item["calories"] - item["calories"]
            total_p += new_item["protein"] - item["protein"]
            total_f += new_item["fat"] - item["fat"]
            total_c += new_item["carbs"] - item["carbs"]
            total_price += new_item["price"] - item["price"]
            basket[i] = new_item
            improved = True
            break
        if not improved:
            break
    return basket, total_cal, total_p, total_f, total_c, total_price

@router.post("/optimize")
def optimize_basket(req: BasketRequest):
    df = load_products()

    # ვეგანური ფილტრი
    if req.vegan_only:
        df = df[df["is_vegan"] == True]

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
        if target_cal < 10:
            raise HTTPException(status_code=400, detail="მაკრო მნიშვნელობები ძალიან დაბალია")
    else:
        raise HTTPException(status_code=400, detail="Invalid input")

    N = calc_n(target_cal)
    groups = get_groups_for_n(N)

    # ვეგანური კალათისთვის — C ჯგუფი ვეგანური პროდუქტებით
    if req.vegan_only:
        vegan_protein = ["კონსერვები", "მარცვლეული და ბურღულეული", "ბოსტნეული"]
        groups = [g if g != "C" else "B" for g in groups]

    basket = []
    used_ids = set()
    total_cal = total_p = total_f = total_c = total_price = 0.0
    remaining = target_cal

    for grp in groups:
        if remaining < target_cal * 0.01:
            break
        cats = get_cats_for_group(grp)
        avail = [c for c in cats if c in df["category"].values]
        if not avail:
            continue
        row = pick_cheapest(df, avail, used_ids)
        if row is None:
            continue
        cal100 = float(row["calories"])
        if cal100 <= 0:
            continue
        mn, mx = get_row_limits(row)
        if row["sale_type"] == "package_pieces":
            pkg = get_pkg_weight(row)
            mx = min(mx, pkg * PKG_MAX_RATIO)
        wanted = min((remaining / cal100) * 100.0, mx)
        wanted = max(wanted, mn)
        item = make_item(row, wanted)
        if item["calories"] < 1:
            continue
        basket.append(item)
        used_ids.add(item["id"])
        total_cal += item["calories"]
        total_p += item["protein"]
        total_f += item["fat"]
        total_c += item["carbs"]
        total_price += item["price"]
        remaining -= item["calories"]

    if not basket:
        raise HTTPException(
            status_code=422,
            detail="ვეგანური კალათის შედგენა ვერ მოხდა — ცოტა პროდუქტია" if req.vegan_only else "Could not build basket"
        )

    basket, total_cal, total_p, total_f, total_c, total_price = balance_to_target(
        basket, df, target_cal, total_cal, total_p, total_f, total_c, total_price
    )

    # დარჩენილი კალორიების შევსება
    cal_diff = target_cal - total_cal
    if abs(cal_diff) > target_cal * 0.02 and cal_diff > 0:
        for grp in ["B", "A", "C"]:
            cats = get_cats_for_group(grp)
            row = pick_cheapest(df, cats, used_ids)
            if row is None:
                continue
            cal100 = float(row["calories"])
            if cal100 <= 0:
                continue
            mn, mx = get_row_limits(row)
            wanted = min((cal_diff / cal100) * 100.0, mx)
            wanted = max(wanted, mn)
            item = make_item(row, wanted)
            if item["calories"] < 1:
                continue
            basket.append(item)
            used_ids.add(item["id"])
            total_cal += item["calories"]
            total_p += item["protein"]
            total_f += item["fat"]
            total_c += item["carbs"]
            total_price += item["price"]
            break

    if req.mode == "macros":
        p_diff = abs(total_p - target_p) / target_p if target_p > 0 else 0
        f_diff = abs(total_f - target_f) / target_f if target_f > 0 else 0
        c_diff = abs(total_c - target_c) / target_c if target_c > 0 else 0
        if p_diff > 0.30 or f_diff > 0.30 or c_diff > 0.30:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"კალათის შედგენა ამ პარამეტრებით შეუძლებელია. "
                    f"მიღებული: ცილა {round(total_p)}გ/{round(target_p)}გ, "
                    f"ცხიმი {round(total_f)}გ/{round(target_f)}გ, "
                    f"ნახ {round(total_c)}გ/{round(target_c)}გ"
                )
            )

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
        new_item["owned"] = item.get("owned", False)
        new_basket.append(new_item)
    totals = {
        "price": round(sum(i["price"] for i in new_basket if not i.get("owned")), 2),
        "protein": round(sum(i["protein"] for i in new_basket), 1),
        "fat": round(sum(i["fat"] for i in new_basket), 1),
        "carbs": round(sum(i["carbs"] for i in new_basket), 1),
        "calories": round(sum(i["calories"] for i in new_basket), 1),
    }
    return {"basket": new_basket, "totals": totals, "message": None}

@router.post("/replace")
def replace_product(req: ReplaceRequest):
    df = load_products()
    if req.vegan_only:
        df = df[df["is_vegan"] == True]
    product_row = df[df["id"] == req.product_id]
    if product_row.empty:
        raise HTTPException(status_code=404, detail="Product not found")
    original = product_row.iloc[0]
    search_cat = req.new_category if req.new_category else original["category"]
    target_cal = req.target_calories or float(original["calories"])
    candidates = df[
        (df["category"] == search_cat) &
        (df["id"] != req.product_id) &
        (~df["id"].isin(req.excluded_ids)) &
        (df["calories"] > 5)
    ].copy()
    if candidates.empty:
        raise HTTPException(status_code=404, detail="No replacement found in this category")
    candidates["ppg"] = candidates.apply(price_per_gram, axis=1)
    if req.sort_by_price == "asc":
        best = candidates.nsmallest(1, "ppg").iloc[0]
    else:
        orig_ppg = price_per_gram(original)
        pricier = candidates[candidates["ppg"] > orig_ppg]
        best = pricier.nsmallest(1, "ppg").iloc[0] if not pricier.empty else candidates.nlargest(1, "ppg").iloc[0]
    cal100 = float(best["calories"])
    if cal100 > 0 and target_cal > 0:
        wanted = (target_cal / cal100) * 100.0
    else:
        mn, mx = get_row_limits(best)
        wanted = (mn + mx) / 2
    item = make_item(best, wanted)
    return {"replacement": item}
