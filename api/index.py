from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# index.py-ს ზუსტი მდებარეობა
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
# ექსელის გზა - ახლა ის index.py-ს გვერდითაა
EXCEL_PATH = os.path.join(CURRENT_DIR, '2nabiji.xlsx')

# templates და static მაინც ზედა დონეზეა
BASE_DIR = os.path.dirname(CURRENT_DIR)

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def clean_float(val):
    try: return float(val) if val else 0.0
    except: return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_categories', methods=['GET'])
def get_categories():
    try:
        if not os.path.exists(EXCEL_PATH):
            return jsonify(["Error: File not found at " + EXCEL_PATH])
        
        df = pd.read_excel(EXCEL_PATH, engine='openpyxl')
        df.columns = df.columns.str.strip().str.lower()
        
        if 'category' in df.columns:
            categories = df['category'].dropna().unique().tolist()
            return jsonify([str(c).strip() for c in categories])
        return jsonify(["Error: 'category' column missing"])
    except Exception as e:
        return jsonify([f"System Error: {str(e)}"])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        if not os.path.exists(EXCEL_PATH):
            return jsonify({"error": "ბაზა ვერ მოიძებნა"}), 404

        df = pd.read_excel(EXCEL_PATH, engine='openpyxl')
        df.columns = df.columns.str.strip().str.lower()

        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        sel_cats = data.get('selectedCategories', [])
        mode = data.get('filterMode', 'include')
        
        if sel_cats:
            if mode == 'include':
                df = df[df['category'].astype(str).str.strip().isin(sel_cats)]
            else:
                df = df[~df['category'].astype(str).str.strip().isin(sel_cats)]

        t_p, t_cal = clean_float(data.get('protein')), clean_float(data.get('calories'))
        
        final_items, total_spending = [], 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        
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
                    f_grams = round(grams)
                    cost = (row['price'] * f_grams) / 1000
                    
                    final_items.append({"name": row['product'], "display": f"~{f_grams}გ", "cost": round(cost, 2)})
                    totals['p'] += (row['protein'] * f_grams) / 100
                    totals['f'] += (row['fat'] * f_grams) / 100
                    totals['c'] += (row['carbs'] * f_grams) / 100
                    totals['cal'] += (row['calories'] * f_grams) / 100
                    total_spending += cost

        return jsonify({"items": final_items, "total_cost": round(total_spending, 2), "totals": {k: round(v, 1) for k, v in totals.items()}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_recipe', methods=['POST'])
def get_recipe():
    try:
        data = request.get_json()
        p_list = "\n".join([f"- {i['name']} ({i['display']})" for i in data.get('items', [])])
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": "შენ ხარ ქართველი მზარეული."}, {"role": "user", "content": f"რეცეპტი:\n{p_list}"}]
        )
        return jsonify({"recipe": response.choices[0].message.content.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
