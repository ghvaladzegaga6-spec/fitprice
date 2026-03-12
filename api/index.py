from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# გზების განსაზღვრა
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CURRENT_DIR)
# ფაილის სახელი ზუსტად ისე, როგორც შენს საქაღალდეშია
FILE_PATH = os.path.join(BASE_DIR, '2nabiji.xlsx')

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def load_my_data():
    if not os.path.exists(FILE_PATH):
        return None
    try:
        # ვკითხულობთ როგორც CSV, რადგან სურათზე აშკარად CSV სტრუქტურაა
        # encoding='utf-8' მნიშვნელოვანია ქართული ასოებისთვის
        df = pd.read_csv(FILE_PATH, encoding='utf-8', on_bad_lines='skip')
        
        # თუ მძიმით ვერ დაშალა და ყველაფერი ერთ სვეტშია
        if len(df.columns) <= 1:
            df = pd.read_csv(FILE_PATH, sep=',', encoding='utf-8')
            
        df.columns = df.columns.str.strip().str.lower()
        return df
    except Exception as e:
        print(f"Error: {e}")
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_categories', methods=['GET'])
def get_categories():
    df = load_my_data()
    if df is not None and 'category' in df.columns:
        # ვიღებთ უნიკალურ მნიშვნელობებს და ვფილტრავთ ცარიელებს
        cats = df['category'].dropna().unique().tolist()
        return jsonify([str(c).strip() for c in cats if str(c).strip()])
    return jsonify(["ბაზა ვერ იკითხება"])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        df = load_my_data()
        if df is None: return jsonify({"error": "ვერ მოიძებნა ფაილი"}), 404

        # რიცხვითი მონაცემების გასწორება
        for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # ფილტრაცია
        sel_cats = data.get('selectedCategories', [])
        if sel_cats:
            mode = data.get('filterMode', 'include')
            if mode == 'include':
                df = df[df['category'].astype(str).str.strip().isin(sel_cats)]
            else:
                df = df[~df['category'].astype(str).str.strip().isin(sel_cats)]

        t_p = float(data.get('protein', 0))
        t_cal = float(data.get('calories', 0))
        
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        items, total_cost = [], 0
        totals = {'p':0, 'f':0, 'c':0, 'cal':0}

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
                    items.append({"name": row['product'], "display": f"~{round(grams)}გ", "cost": round(cost, 2)})
                    total_cost += cost
                    totals['p'] += (row['protein'] * grams) / 100
                    totals['cal'] += (row['calories'] * grams) / 100

        return jsonify({"items": items, "total_cost": round(total_cost, 2), "totals": totals})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
