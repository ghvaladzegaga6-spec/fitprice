from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# ლოგიკა საქაღალდეებისთვის: index.py არის /api-ში, ექსელი არის / (root)-ში
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__)) # /api
BASE_DIR = os.path.dirname(CURRENT_DIR) # / (root)

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
EXCEL_PATH = os.path.join(BASE_DIR, '2nabiji.xlsx')

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
            return jsonify([])
        
        # ძრავა openpyxl აუცილებელია .xlsx ფაილებისთვის
        df = pd.read_excel(EXCEL_PATH, engine='openpyxl')
        
        if 'category' in df.columns:
            # მოვაცილოთ ცარიელები და გავასუფთავოთ ტექსტი
            categories = df['category'].dropna().unique().tolist()
            return jsonify([str(c).strip() for c in categories if str(c).strip()])
        return jsonify([])
    except Exception as e:
        print(f"Error reading categories: {e}")
        return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        if not os.path.exists(EXCEL_PATH):
            return jsonify({"error": "მონაცემთა ბაზა ვერ მოიძებნა"}), 404

        df = pd.read_excel(EXCEL_PATH, engine='openpyxl')
        
        # რიცხვითი მონაცემების გასუფთავება
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
            elif mode == 'exclude':
                df = df[~df['category'].astype(str).str.strip().isin(sel_cats)]

        t_p = clean_float(data.get('protein'))
        t_cal = clean_float(data.get('calories'))
        
        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        
        if not opt_df.empty and (t_p > 0 or t_cal > 0):
            # ხაზოვანი დაპროგრამება (Optimization)
            costs = (opt_df['price'] / 10).tolist()
            A_ub, b_ub = [], []
            
            if t_p > 0:
                A_ub.append((-opt_df['protein']).tolist())
                b_ub.append(-t_p)
            if t_cal > 0:
                A_ub.append((-opt_df['calories']).tolist())
                b_ub.append(-t_cal * 0.95)
                A_ub.append(opt_df['calories'].tolist())
                b_ub.append(t_cal * 1.05)

            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5.0), method='highs')
            
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 50: continue
                    row = opt_df.iloc[i]
                    
                    # ფასის და წონის დათვლა
                    f_grams = max(100, grams)
                    cost = (row['price'] * f_grams) / 1000
                    txt = f"აწონე ~{round(f_grams)}გ"

                    final_items.append({
                        "name": row['product'], 
                        "display": txt, 
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
        basket_items = data.get('items', [])
        if not basket_items: return jsonify({"error": "კალათა ცარიელია"}), 400

        products_str = '\n'.join([f"- {i['name']} ({i['display']})" for i in basket_items])

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "შენ ხარ ქართველი მზარეული. დაწერე რეცეპტი მოცემული პროდუქტებით."},
                {"role": "user", "content": f"პროდუქტები:\n{products_str}"}
            ]
        )
        return jsonify({"recipe": response.choices[0].message.content.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
