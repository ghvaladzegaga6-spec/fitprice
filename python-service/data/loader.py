import pandas as pd
import os
import math
from fastapi import APIRouter

router = APIRouter()
DATA_PATH = os.path.join(os.path.dirname(__file__), "products.csv")

def load_products() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, encoding="utf-8-sig")
    df.columns = df.columns.str.strip()

    for col in ["protein","fat","carbs","calories","price","weight","package_weight"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["is_promo"] = df["is_promo"].astype(int).astype(bool)
    df = df[df["price"] > 0].copy()
    df.reset_index(drop=True, inplace=True)
    df["id"] = df.index

    # sale_type: package_weight > 0 → შეკვრა, სხვა → წონა
    df["sale_type"] = df.apply(
        lambda r: "package_pieces" if r["package_weight"] > 0 else "weight",
        axis=1
    )
    # total_package_weight alias
    df["total_package_weight"] = df.apply(
        lambda r: r["package_weight"] if r["package_weight"] > 0 else r["weight"],
        axis=1
    )
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

@router.get("/promos")
def get_promos():
    df = load_products()
    promos = df[df["is_promo"] == True]
    sample = promos.sample(min(3, len(promos))) if len(promos) >= 1 else promos
    return {"promos": df_to_dict(sample)}
