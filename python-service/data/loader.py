import pandas as pd
import os
import math
from fastapi import APIRouter
from typing import Optional

router = APIRouter()
DATA_PATH = os.path.join(os.path.dirname(__file__), "products.csv")

def load_products() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, encoding="utf-8-sig")
    df.columns = df.columns.str.strip()

    numeric_cols = ["protein", "fat", "carbs", "calories", "price",
                    "weight_per_100g", "full_package_weight"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["is_promo"] = df["is_promo"].astype(int).astype(bool)
    df = df[df["price"] > 0].copy()
    df.reset_index(drop=True, inplace=True)
    df["id"] = df.index

    # sale_type ავტომატური განსაზღვრა
    # თუ full_package_weight > 0 → package, სხვა → weight
    df["sale_type"] = df.apply(
        lambda r: "package_pieces" if r["full_package_weight"] > 0 else "weight",
        axis=1
    )
    # total_package_weight alias
    df["total_package_weight"] = df.apply(
        lambda r: r["full_package_weight"] if r["full_package_weight"] > 0 else 1000.0,
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
            elif isinstance(v, bool):
                record[k] = v
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
    cats = sorted(df["category"].unique().tolist())
    return {"categories": cats}

@router.get("/promos")
def get_promos():
    df = load_products()
    promos = df[df["is_promo"] == True]
    sample = promos.sample(min(3, len(promos))) if len(promos) >= 1 else promos
    return {"promos": df_to_dict(sample)}
