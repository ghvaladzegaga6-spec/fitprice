from fastapi import APIRouter
import pandas as pd
import os

router = APIRouter()
_df_cache = None

DATA_PATH = os.path.join(os.path.dirname(__file__), "products.xlsx")

def load_products() -> pd.DataFrame:
    global _df_cache
    if _df_cache is not None:
        return _df_cache.copy()

    # Support both xlsx and csv
    if os.path.exists(DATA_PATH):
        df = pd.read_excel(DATA_PATH)
    else:
        csv_path = DATA_PATH.replace(".xlsx", ".csv")
        df = pd.read_csv(csv_path)

    df.columns = [c.strip().lower() for c in df.columns]

    # Normalize columns
    df["protein"]  = pd.to_numeric(df.get("protein",  0), errors="coerce").fillna(0)
    df["fat"]      = pd.to_numeric(df.get("fat",      0), errors="coerce").fillna(0)
    df["carbs"]    = pd.to_numeric(df.get("carbs",    0), errors="coerce").fillna(0)
    df["calories"] = pd.to_numeric(df.get("calories", 0), errors="coerce").fillna(0)
    df["price"]    = pd.to_numeric(df.get("price",    0), errors="coerce").fillna(0)
    df["is_promo"] = pd.to_numeric(df.get("is_promo", 0), errors="coerce").fillna(0).astype(int)
    df["gym"]      = pd.to_numeric(df.get("gym",      1), errors="coerce").fillna(0).astype(int)
    df["vegan"]    = pd.to_numeric(df.get("vegan",    0), errors="coerce").fillna(0).astype(int)

    # sale_type: weight (წონით) vs package_pieces (დაფასოვებული)
    # weight სვეტი — თუ 100 წერია = წონით იყიდება
    # total_package_weight სვეტი — თუ > 0 = დაფასოვებული
    w_col   = pd.to_numeric(df.get("weight",               0), errors="coerce").fillna(0)
    pkg_col = pd.to_numeric(df.get("total_package_weight", 0), errors="coerce").fillna(0)

    df["sale_type"] = df.apply(
        lambda r: "weight" if float(r.get("weight", 0) or 0) > 0 else "package_pieces",
        axis=1
    )
    df["unit_weight"]           = w_col
    df["total_package_weight"]  = pkg_col

    # min/max weight parsing — "200-400" → min_g=200, max_g=400
    def parse_minmax(val):
        try:
            parts = str(val).split("-")
            return float(parts[0]), float(parts[1])
        except:
            return 50.0, 300.0

    df[["min_g", "max_g"]] = df["min_max_weight"].apply(
        lambda v: pd.Series(parse_minmax(v))
    )

    # min_weight_to_purchase
    df["min_weight_to_buy"] = pd.to_numeric(
        df.get("min_weight_to_purchase", 0), errors="coerce"
    ).fillna(0)

    # id column
    df = df.reset_index(drop=True)
    df["id"] = df.index + 1

    df["category"] = df["category"].fillna("სხვა").astype(str)
    df["product"]  = df["product"].fillna("").astype(str)

    _df_cache = df.copy()
    return df.copy()


def df_to_dict(df: pd.DataFrame) -> list:
    return df.to_dict(orient="records")


def invalidate_cache():
    global _df_cache
    _df_cache = None


# ─── API endpoints ────────────────────────────────────────────────────────────

@router.get("/categories")
def get_categories():
    df = load_products()
    cats = sorted(df["category"].unique().tolist())
    return {"categories": cats}


@router.get("/vegan_categories")
def get_vegan_categories():
    df = load_products()
    vegan_df = df[df["vegan"] == 1]
    cats = sorted(vegan_df["category"].unique().tolist())
    return {"categories": cats}


@router.get("/gym_categories")
def get_gym_categories():
    df = load_products()
    gym_df = df[df["gym"] == 1]
    cats = sorted(gym_df["category"].unique().tolist())
    return {"categories": cats}


@router.get("/promos")
def get_promos():
    df = load_products()
    promo_df = df[df["is_promo"] == 1].copy()
    return {"promos": df_to_dict(promo_df)}


@router.get("/products")
def get_products():
    df = load_products()
    return {"products": df_to_dict(df)}
