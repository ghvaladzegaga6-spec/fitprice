import pandas as pd
import os
import math
from fastapi import APIRouter

router = APIRouter()
DATA_PATH = os.path.join(os.path.dirname(__file__), "products.csv")

def load_products() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, encoding="utf-8-sig")
    df.columns = df.columns.str.strip()

    for col in ["protein","fat","carbs","calories","price",
                "unit_weight","total_package_weight"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["is_promo"] = df["is_promo"].astype(int).astype(bool)

    # vegan
    if "vegan" in df.columns:
        df["vegan"] = df["vegan"].fillna("").astype(str).str.strip()
        df["is_vegan"] = df["vegan"] == "1"
    else:
        df["is_vegan"] = False

    # min_max_weight — parse "100-350" → min_g, max_g
    if "min_max_weight" in df.columns:
        df["min_max_weight"] = df["min_max_weight"].fillna("50-200").astype(str)
        df["min_g"] = df["min_max_weight"].str.split("-").str[0].str.strip()
        df["max_g"] = df["min_max_weight"].str.split("-").str[1].str.strip()
        df["min_g"] = pd.to_numeric(df["min_g"], errors="coerce").fillna(50)
        df["max_g"] = pd.to_numeric(df["max_g"], errors="coerce").fillna(200)
    else:
        df["min_g"] = 50
        df["max_g"] = 200

    # min_weight_to_buy
    if "min_weight_to_buy" in df.columns:
        df["min_weight_to_buy"] = pd.to_numeric(
            df["min_weight_to_buy"], errors="coerce"
        ).fillna(0)
    else:
        df["min_weight_to_buy"] = 0

    # sale_type
    if "sale_type" not in df.columns:
        df["sale_type"] = df.apply(
            lambda r: "package_pieces" if r["total_package_weight"] > 0 and r["total_package_weight"] != 1000 else "weight",
            axis=1
        )

    df = df[df["price"] > 0].copy()
    df.reset_index(drop=True, inplace=True)
    df["id"] = df.index
    return df

def df_to_dict(df: pd.DataFrame) -> list:
    records = []
    for _, row in df.iterrows():
        record = {}
        for k, v in row.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                record[k] = None
            else:
                record[k] = v
        records.append(record)
    return records

@router.get("/products")
def get_products():
    df = load_products()
    return {"products": df_to_dict(df)}

@router.get("/categories")
def get_categories():
    df = load_products()
    return {"categories": sorted(df["category"].unique().tolist())}

@router.get("/vegan_categories")
def get_vegan_categories():
    df = load_products()
    vegan_cats = sorted(df[df["is_vegan"] == True]["category"].unique().tolist())
    return {"categories": vegan_cats}

@router.get("/promos")
def get_promos():
    df = load_products()
    promos = df[df["is_promo"] == True]
    sample = promos.sample(min(3, len(promos))) if len(promos) >= 1 else promos
    return {"promos": df_to_dict(sample)}
