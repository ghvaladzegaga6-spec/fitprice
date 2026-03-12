from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# გზების განსაზღვრა (ფაილი არის /api-ს გარეთ, root-ში)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CURRENT_DIR)
# შენი ფაილის სახელი ატვირთულის მიხედვით
FILE_PATH = os.path.join(BASE_DIR, '2nabiji.xlsx')

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def load_data():
    """ფუნქცია რომელიც კითხულობს ფაილს ფორმატის მიუხედავად"""
    try:
        if not os.path.exists(FILE_PATH):
            return None
        
        # ვცდილობთ წავიკითხოთ როგორც CSV (რადგან შენი ფაილი რეალურად CSV-ა)
        try:
            df = pd.read_csv(FILE_PATH)
        except:
            # თუ არ გამოვიდა, ვკითხულობთ როგორც Excel
            df = pd.read_excel(FILE_PATH)
            
        # სვეტების სახელების გასუფთავება
        df.columns = df.columns.str.strip().str.lower()
        return df
    except Exception as e:
        print(f"Error loading file: {e}")
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_categories', methods=['GET'])
def get_categories():
    df = load_data()
    if df is not None and 'category' in df.columns:
        categories = df['category'].dropna().unique().tolist()
        return jsonify([str(c).strip() for c in categories])
    return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        df = load_data()
        if df is None:
            return jsonify({"error": "ბაზა ვერ მოიძებნა"}), 404

        # მონაცემების ტიპების გასწორება
        num_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in num_cols:
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

        target_p = float(data.get('protein', 0))
        target_cal = float(data.get('calories', 0))
        
        # ოპტიმიზაცია (მხოლოდ არა-პრომო პროდუქტებზე)
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        final_items = []
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
        total_cost = 0

        if not opt_df.empty and (target_p > 0 or target_cal > 0):
            costs = (opt_df['price'] / 10).tolist() # ფასი 100გ-ზე
            A_ub, b_ub = [], []
            
            if target_p > 0:
                A_ub.append((-opt_df['protein']).tolist())
                b_ub.append(-target_p)
            if target_cal > 0:
                A_ub.append((-opt_df['calories']).tolist())
                b_ub.append(-target_cal * 0.95)
                A_ub.append(opt_df['calories'].tolist())
                b_ub.append(target_cal * 1.05)

            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')
            
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 50: continue
                    row = opt_df.iloc[i]
                    cost = (row['price'] * grams) / 1000
                    final_items.append({
                        "name": row['product'],
                        "display": f"აწონე ~{round(grams)}გ",
                        "cost": round(cost, 2)
                    })
                    total_cost += cost
                    totals['p'] += (row['protein'] * grams) / 100
                    totals['cal'] += (row['calories'] * grams) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_cost, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
