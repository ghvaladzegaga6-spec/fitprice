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

class ReplaceRequest(BaseModel):
    product_id: int
    excluded_ids: Optional[List[int]] = []
    target_calories: Optional[float] = None
    new_category: Optional[str] = None
    sort_by_price: str = Field("asc", pattern="^(asc|desc)$")

class RebalanceRequest(BaseModel):
    basket: List[dict]
    removed_id: int
    target_calories: Optional[float] = None

PKG_MAX_RATIO = 0.40

# ══════════════════════════════════════════════════════════════
# კატეგორიების ჯგუფები
# ══════════════════════════════════════════════════════════════
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
    return "C"  # default

# ══════════════════════════════════════════════════════════════
# ფორმულები
# ══════════════════════════════════════════════════════════════

def calc_n(K: float) -> int:
    """პროდუქტების რაოდენობა"""
    return min(8, max(2, math.floor(K / 500) + 2))

def calc_min_max(group: str, K: float) -> tuple:
    """min/max გრამები ჯგუფის მიხედვით"""
    if group == "A":
        return max(100, K * 0.08), min(400, K * 0.18)
    elif group == "B":
        return max(40, K * 0.04), min(150, K * 0.08)
    elif group == "C":
        return max(80, K * 0.05), min(250, K * 0.10)
    elif group == "D":
        return max(100, K * 0.05), min(300, K * 0.10)
    elif group == "E":
        return max(5, K * 0.01), min(50, K * 0.03)
    elif group == "F":
        return 3, 30
    return max(50, K * 0.04), min(200, K * 0.10)

def get_groups_for_n(N: int) -> list:
    """კატეგორიების ჯგუფები N-ის მიხედვით"""
    groups = []
    if N >= 2:
        groups += ["B", "C"]
    if N >= 3:
        groups += ["A"]
    if N >= 4:
        groups += ["D"]
    if N >= 5:
        groups += ["A"]  # დამატებითი A ან C ან B
    if N >= 6:
        groups += ["D"]  # დამატებითი A ან D
    if N >= 7:
        groups += ["E"]  # მაქს 1 E
    if N >= 8:
        groups += ["C"]  # დამატებითი ცილა
    return groups[:N]

# ══════════════════════════════════════════════════════════════
# დამხმარე ფუნქციები
# ══════════════════════════════════════════════════════════════

def get_pkg_weight(row) -> float:
    return float(row["total_package_weight"]) if float(row["total_package_weight"]) > 0 else 500.0

def price_per_gram(row) -> float:
    if row["sale_type"] == "package_pieces":
        return float(row["price"]) / get_pkg_weight(row)
    w = float(row.get("weight", 1000) or 1000)
    return float(row["price"]) / w

def resolve(row, wanted: float, min_g: float, max_g: float):
    if row["sale_type"] == "package_pieces":
        pkg = get_pkg_weight(row)
        use = min(wanted, pkg * PKG_MAX_RATIO, max_g)
        use = max(round(use), max(1, round(min_g)))
        price = float(row["price"])
        pct = round((use / pkg) * 100)
        note = (f"🛒 შეიძინე 1 შეკვრა — {pkg:.0f}გ · {price:.2f}₾  |  "
                f"✂️ გამოიყენე: {use}გ ({pct}%)")
        return use, price, note
    else:
        grams = max(round(min_g), min(round(wanted), round(max_g)))
        w = float(row.get("weight", 1000) or 1000)
        price = round((float(row["price"]) / w) * grams, 2)
        return grams, price, None

def make_item(row, wanted: float, min_g: float, max_g: float) -> dict:
    grams, price, note = resolve(row, wanted, min_g, max_g)
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

def get_cats_for_group(group: str) -> list:
    mapping = {"A": GROUP_A, "B": GROUP_B, "C": GROUP_C,
               "D": GROUP_D, "E": GROUP_E, "F": GROUP_F}
    return mapping.get(group, GROUP_C)

def balance_to_target(basket, df, target_cal, total_cal, total_p, total_f, total_c, total_price, target_cal_orig):
    """კალორიების ზუსტი დაბალანსება"""
    for _ in range(15):
        cal_diff = target_cal - total_cal
        if abs(cal_diff) <= target_cal * 0.005:
            break
        improved = False
        for i, item in enumerate(basket):
            row_df = df[df["id"] == item["id"]]
            if row_df.empty:
                continue
            row = row_df.iloc[0]
            if float(row["calories"]) <= 0:
                continue
            grp = cat_group(row["category"])
            mn, mx = calc_min_max(grp, target_cal_orig)
            if row["sale_type"] == "package_pieces":
                pkg = get_pkg_weight(row)
                mx = min(mx, pkg * PKG_MAX_RATIO)
            if cal_diff > 0 and item["grams"] >= mx:
                continue
            if cal_diff < 0 and item["grams"] <= mn:
                continue
            extra = (cal_diff / float(row["calories"])) * 100.0
            new_grams = item["grams"] + extra
            # weight პროდუქტისთვის ლიმიტის გარეშე თუ საჭიროა
            if row["sale_type"] == "weight":
                new_grams = max(1.0, new_grams)
            else:
                new_grams = max(mn, min(new_grams, mx))
            if abs(new_grams - item["grams"]) < 0.5:
                continue
            new_item = make_item(row, new_grams, mn, new_grams + 1 if row["sale_type"] == "weight" else mx)
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

# ══════════════════════════════════════════════════════════════
# endpoints
# ══════════════════════════════════════════════════════════════

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
        if target_cal < 10:
            raise HTTPException(status_code=400, detail="მაკრო მნიშვნელობები ძალიან დაბალია")
    else:
        raise HTTPException(status_code=400, detail="Invalid input")

    N = calc_n(target_cal)
    groups = get_groups_for_n(N)

    basket = []
    used_ids = set()
    used_groups = {}
    total_cal = total_p = total_f = total_c = total_price = 0.0
    remaining = target_cal

    for grp in groups:
        if remaining < target_cal * 0.01:
            break
        cats = get_cats_for_group(grp)
        # ფილტრი — მხოლოდ ხელმისაწვდომი კატეგორიები
        avail_cats = [c for c in cats if c in df["category"].values]
        if not avail_cats:
            continue
        row = pick_cheapest(df, avail_cats, used_ids)
        if row is None:
            continue
        cal100 = float(row["calories"])
        if cal100 <= 0:
            continue
        mn, mx = calc_min_max(grp, target_cal)
        # გრამები remaining კალორიებიდან
        wanted = (remaining / cal100) * 100.0
        wanted = max(mn, min(wanted, mx))
        item = make_item(row, wanted, mn, mx)
        if item["calories"] < 1:
            continue
        basket.append(item)
        used_ids.add(item["id"])
        used_groups[grp] = used_groups.get(grp, 0) + 1
        total_cal += item["calories"]
        total_p += item["protein"]
        total_f += item["fat"]
        total_c += item["carbs"]
        total_price += item["price"]
        remaining -= item["calories"]

    if not basket:
        raise HTTPException(status_code=422, detail="Could not build basket")

    # კალორიების დაბალანსება
    basket, total_cal, total_p, total_f, total_c, total_price = balance_to_target(
        basket, df, target_cal, total_cal, total_p, total_f, total_c, total_price, target_cal
    )

    # თუ კვლავ სხვაობაა — დამატებითი პროდუქტი
    cal_diff = target_cal - total_cal
    if abs(cal_diff) > target_cal * 0.02 and cal_diff > 0:
        for grp in ["B", "C", "A"]:
            cats = get_cats_for_group(grp)
            row = pick_cheapest(df, cats, used_ids)
            if row is None:
                continue
            cal100 = float(row["calories"])
            if cal100 <= 0:
                continue
            mn, mx = calc_min_max(grp, target_cal)
            wanted = (cal_diff / cal100) * 100.0
            wanted = max(mn, min(wanted, mx))
            item = make_item(row, wanted, mn, mx)
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

    # მაკრო ვალიდაცია
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
    new_basket = []
    total_cal = total_p = total_f = total_c = total_price = 0.0
    scale = target_cal / current_cal if current_cal > 0 else 1.0
    scale = min(scale, 1.5)
    for item in remaining:
        row_df = df[df["id"] == item["id"]]
        if row_df.empty:
            new_basket.append(item)
            total_cal += item["calories"]
            total_p += item["protein"]
            total_f += item["fat"]
            total_c += item["carbs"]
            total_price += item["price"]
            continue
        row = row_df.iloc[0]
        grp = cat_group(row["category"])
        mn, mx = calc_min_max(grp, target_cal)
        new_grams = item["grams"] * scale
        new_item = make_item(row, new_grams, mn, new_grams + 1)
        new_item["owned"] = item.get("owned", False)
        new_basket.append(new_item)
        total_cal += new_item["calories"]
        total_p += new_item["protein"]
        total_f += new_item["fat"]
        total_c += new_item["carbs"]
        total_price += new_item["price"] if not new_item.get("owned") else 0

    totals = {
        "price": round(sum(i["price"] for i in new_basket if not i.get("owned")), 2),
        "protein": round(total_p, 1),
        "fat": round(total_f, 1),
        "carbs": round(total_c, 1),
        "calories": round(total_cal, 1),
    }
    return {"basket": new_basket, "totals": totals, "message": None}

@router.post("/replace")
def replace_product(req: ReplaceRequest):
    """
    პროდუქტის შეცვლა:
    - new_category: თუ მითითებულია, სხვა კატეგორიით ჩაანაცვლებს
    - sort_by_price: asc (ყველაზე იაფი) ან desc (შემდეგი ძვირი)
    - target_calories: ზუსტი კალორიების შეცვლა
    """
    df = load_products()
    product_row = df[df["id"] == req.product_id]
    if product_row.empty:
        raise HTTPException(status_code=404, detail="Product not found")
    original = product_row.iloc[0]

    # კატეგორია — ახალი ან იგივე
    search_cat = req.new_category if req.new_category else original["category"]
    grp = cat_group(search_cat)
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
        # შემდეგი ძვირი — ამჟამინდელზე ძვირი
        orig_ppg = price_per_gram(original)
        pricier = candidates[candidates["ppg"] > orig_ppg]
        if pricier.empty:
            best = candidates.nlargest(1, "ppg").iloc[0]
        else:
            best = pricier.nsmallest(1, "ppg").iloc[0]

    # გრამები კალორიების შესაბამისად
    cal100 = float(best["calories"])
    if cal100 > 0 and target_cal > 0:
        wanted = (target_cal / cal100) * 100.0
    else:
        mn, mx = calc_min_max(grp, target_cal * 10)
        wanted = (mn + mx) / 2

    mn, mx = calc_min_max(grp, target_cal * 10)
    item = make_item(best, wanted, mn, wanted + 1)

    return {"replacement": item}

@router.get("/categories_list")
def get_all_categories():
    """ყველა კატეგორია ჯგუფების მიხედვით"""
    df = load_products()
    cats = sorted(df["category"].unique().tolist())
    result = {}
    for cat in cats:
        grp = cat_group(cat)
        if grp not in result:
            result[grp] = []
        result[grp].append(cat)
    return {"groups": result, "categories": cats}
