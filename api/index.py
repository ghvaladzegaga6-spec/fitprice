from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# გზების განსაზღვრა (index.py არის api ფოლდერში, ფაილი კი მაღლა)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CURRENT_DIR)
# ფაილის სახელი ზუსტად ისე, როგორც გაქვს
FILE_PATH = os.path.join(BASE_DIR, '2nabiji.xlsx')

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def get_clean_df():
    """ფაილის წაკითხვის და გასუფთავების ლოგიკა"""
    if not os.path.exists(FILE_PATH):
        return None
    try:
        # შენი ფაილი რეალურად არის CSV, ამიტომ ვკითხულობთ ასე:
        df = pd.read_csv(FILE_PATH, encoding='utf-8')
    except:
        try:
            # თუ მაინც ექსელია, მაშინ ასე:
            df = pd.read_excel(FILE_PATH)
        except:
            return None
    
    # სვეტების სახელების გასუფთავება (რომ category დაემთხვეს)
    df.columns = df.columns.str.strip().str.lower()
    return df

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_categories', methods=['GET'])
def get_categories():
    df = get_clean_df()
    if df is not None and 'category' in df.columns:
        # ვიღებთ უნიკალურ კატეგორიებს
        categories = df['category'].dropna().unique().tolist()
        return jsonify([str(c).strip() for c in categories])
    return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        df = get_clean_df()
        if df is None:
            return jsonify({"error": "მონაცემები ვერ ჩაიტვირთა"}), 404

        # რიცხვითი სვეტების დამუშავება
        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # ფილტრაცია კატეგორიებით
        sel_cats = data.get('selectedCategories', [])
        mode = data.get('filterMode', 'include')
        if sel_cats:
            if mode == 'include':
                df = df[df['category'].astype(str).str.strip().isin(sel_cats)]
            else:
                df = df[~df['category'].astype(str).str.strip().isin(sel_cats)]

        t_p = float(data.get('protein', 0))
        t_cal = float(data.get('calories', 0))
        
        # ოპტიმიზაცია
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        final_items = []
        total_cost = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        if not opt_df.empty and (t_p > 0 or t_cal > 0):
            costs = (opt_df['price'] / 10).tolist()
            A_ub, b_ub = [], []
            if t_p > 0:
                A_ub.append((-opt_df['protein']).tolist()); b_ub.append(-t_p)
            if t_cal > 0:
                A_ub.append((-opt_df['calories']).tolist()); b_ub.append(-t_cal * 0.95)
                A_ub.append(opt_df['calories'].tolist()); b_ub.append(t_cal * 1.05)

            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')
            
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 40: continue
                    row = opt_df.iloc[i]
                    cost = (row['price'] * grams) / 1000
                    final_items.append({
                        "name": row['product'],
                        "display": f"~{round(grams)}გ",
                        "cost": round(cost, 2)
                    })
                    total_cost += cost
                    totals['p'] += (row['protein'] * grams) / 100
                    totals['cal'] += (row['calories'] * grams) / 100

        return jsonify({"items": final_items, "total_cost": round(total_cost, 2), "totals": {k: round(v, 1) for k, v in totals.items()}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
