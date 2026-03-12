from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# OpenAI API Key - Vercel-ის გარემოდან
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

def clean_float(val):
    try: return float(val) if val else 0.0
    except: return 0.0

@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_categories', methods=['GET'])
def get_categories():
    try:
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        if not os.path.exists(csv_path): return jsonify([])
        df = pd.read_csv(csv_path)
        categories = df['category'].dropna().unique().tolist()
        return jsonify(categories)
    except:
        return jsonify([])

@app.route('/get_promos', methods=['GET'])
def get_promos():
    try:
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        if not os.path.exists(csv_path): return jsonify([])
        df = pd.read_csv(csv_path)
        promo_df = df[df['is_promo'] == 1]
        if promo_df.empty: return jsonify([])
        count = min(3, len(promo_df))
        return jsonify(promo_df.sample(n=count).to_dict(orient='records'))
    except:
        return jsonify([])

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        if not os.path.exists(csv_path):
            return jsonify({"error": "მონაცემთა ბაზა ვერ მოიძებნა"}), 404

        df = pd.read_csv(csv_path)
        
        # კატეგორიების ფილტრაცია
        selected_cats = data.get('categories', [])
        filter_mode = data.get('filterMode', 'include')
        if selected_cats:
            if filter_mode == 'include':
                df = df[df['category'].isin(selected_cats)]
            else:
                df = df[~df['category'].isin(selected_cats)]

        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p, t_c, t_f, t_cal = [clean_float(data.get(k)) for k in ['protein', 'carbs', 'fat', 'calories']]
        final_items, total_spending = [], 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        # პრომოები
        for promo in data.get('selectedPromos', []):
            p_weight = clean_float(promo.get('unit_weight')) or 100
            final_items.append({"name": f"⭐ {promo['product']}", "display": "პრომო შეთავაზება", "cost": clean_float(promo['price'])})
            for k, m in zip(['p','f','c','cal'], ['protein','fat','carbs','calories']):
                totals[k] += (clean_float(promo[m]) * p_weight) / 100
            total_spending += clean_float(promo['price'])

        # ოპტიმიზაცია
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        costs = (opt_df['price'] / 10).tolist()
        A_ub, b_ub = [], []
        rem_p, rem_c, rem_f, rem_cal = t_p-totals['p'], t_c-totals['c'], t_f-totals['f'], t_cal-totals['cal']

        if t_p > 0: A_ub.append((-opt_df['protein']).tolist()); b_ub.append(-max(0, rem_p))
        if t_c > 0: A_ub.append((-opt_df['carbs']).tolist()); b_ub.append(-max(0, rem_c))
        if t_f > 0: A_ub.append((-opt_df['fat']).tolist()); b_ub.append(-max(0, rem_f))
        if t_cal > 0:
            A_ub.append((-opt_df['calories']).tolist()); b_ub.append(-max(0, rem_cal) * 0.95)
            A_ub.append(opt_df['calories'].tolist()); b_ub.append(max(0, rem_cal) * 1.05)

        if A_ub:
            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5.0), method='highs')
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 50: continue
                    row = opt_df.iloc[i]
                    f_grams = max(100, grams)
                    cost = (float(row['price']) * f_grams) / 1000
                    final_items.append({"name": row['product'], "display": f"აწონე ~{round(f_grams)}გ", "cost": round(cost, 2), "grams": round(f_grams)})
                    for k, m in zip(['p','f','c','cal'], ['protein','fat','carbs','calories']):
                        totals[k] += (row[m] * f_grams) / 100
                    total_spending += cost

        return jsonify({"items": final_items, "total_cost": round(total_spending, 2), "totals": {k: round(v, 1) for k, v in totals.items()}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/generate_recipe', methods=['POST'])
def generate_recipe():
    data = request.get_json()
    items = data.get('items', [])
    if len(items) < 3:
        df = pd.read_csv(os.path.join(BASE_DIR, '2nabiji.csv'))
        cheapest = df.sort_values(by='price').head(2)['product'].tolist()
        return jsonify({"recipe": f"კალათაში მხოლოდ {len(items)} პროდუქტია. სცადეთ დაამატოთ: {', '.join(cheapest)}."})
    
    prompt = f"შექმენი მოკლე რეცეპტი ამ ინგრედიენტებით: {', '.join([i['name'] for i in items])}. დაიცავი გრამატიკა."
    response = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": prompt}])
    return jsonify({"recipe": response.choices[0].message.content})

if __name__ == '__main__':
    app.run(debug=True)
