from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from pathlib import Path
from openai import OpenAI

# აბსოლუტური გზების დადგენა pathlib-ით
# __file__ არის /api/index.py
BASE_DIR = Path(__file__).resolve().parent.parent # ადის Root-ში
EXCEL_PATH = BASE_DIR / '2nabiji.xlsx'

app = Flask(__name__, 
            template_folder=str(BASE_DIR / 'templates'),
            static_folder=str(BASE_DIR / 'static'))

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def clean_float(val):
    try:
        return float(val) if val else 0.0
    except (ValueError, TypeError):
        return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_categories', methods=['GET'])
def get_categories():
    try:
        if not EXCEL_PATH.exists():
            return jsonify([])
        
        # ვკითხულობთ ექსელს და ვასუფთავებთ სვეტებს
        df = pd.read_excel(EXCEL_PATH, engine='openpyxl')
        df.columns = df.columns.str.strip().str.lower()
        
        if 'category' in df.columns:
            categories = df['category'].dropna().unique().tolist()
            return jsonify([str(c).strip() for c in categories])
        return jsonify([])
    except Exception as e:
        print(f"Error: {e}")
        return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        if not EXCEL_PATH.exists():
            return jsonify({"error": "ბაზა ვერ მოიძებნა"}), 404

        df = pd.read_excel(EXCEL_PATH, engine='openpyxl')
        df.columns = df.columns.str.strip().str.lower()

        # რიცხვითი მონაცემების კონვერტაცია
        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        # კატეგორიების ფილტრაცია
        sel_cats = data.get('selectedCategories', [])
        mode = data.get('filterMode', 'include')
        
        if sel_cats:
            if mode == 'include':
                df = df[df['category'].astype(str).str.strip().isin(sel_cats)]
            else:
                df = df[~df['category'].astype(str).str.strip().isin(sel_cats)]

        target_p = clean_float(data.get('protein'))
        target_cal = clean_float(data.get('calories'))
        
        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        # მხოლოდ ის პროდუქტები, რომლებიც არაა პრომო (Optimization)
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        
        if not opt_df.empty and (target_p > 0 or target_cal > 0):
            # ფასი 100 გრამზე (რომ ოპტიმიზატორმა იაფი იპოვოს)
            costs = (opt_df['price'] / 10).tolist()
            A_ub, b_ub = [], []
            
            # ცილის პირობა: მინიმუმ target_p
            if target_p > 0:
                A_ub.append((-opt_df['protein']).tolist())
                b_ub.append(-target_p)
            
            # კალორიების პირობა: +/- 5% დიაპაზონი
            if target_cal > 0:
                A_ub.append((-opt_df['calories']).tolist())
                b_ub.append(-target_cal * 0.95)
                A_ub.append(opt_df['calories'].tolist())
                b_ub.append(target_cal * 1.05)

            # ამოხსნა (Bounds: 0-დან 5-მდე, ანუ მაქსიმუმ 500გ პროდუქტზე)
            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')
            
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 40: continue # ძალიან მცირე რაოდენობას ვფილტრავთ
                    
                    row = opt_df.iloc[i]
                    f_grams = round(grams)
                    cost = (row['price'] * f_grams) / 1000
                    
                    final_items.append({
                        "name": row['product'],
                        "display": f"აწონე ~{f_grams}გ",
                        "cost": round(cost, 2)
                    })
                    
                    totals['p'] += (row['protein'] * f_grams) / 100
                    totals['f'] += (row['fat'] * f_grams) / 100
                    totals['c'] += (row['carbs'] * f_grams) / 100
                    totals['cal'] += (row['calories'] * f_grams) / 100
                    total_spending += cost

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_recipe', methods=['POST'])
def get_recipe():
    try:
        data = request.get_json()
        basket = data.get('items', [])
        if not basket: return jsonify({"error": "კალათა ცარიელია"})

        p_list = "\n".join([f"- {i['name']} ({i['display']})" for i in basket])
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "შენ ხარ ქართველი მზარეული. დაწერე რეცეპტი მოცემული პროდუქტებით."},
                {"role": "user", "content": f"პროდუქტები:\n{p_list}"}
            ]
        )
        return jsonify({"recipe": response.choices[0].message.content.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
