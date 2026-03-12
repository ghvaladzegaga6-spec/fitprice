from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# OpenAI API Key
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

def get_csv_path():
    # ვამოწმებთ ორივე შესაძლო სახელს, რაც შეიძლება ფაილს ჰქონდეს
    paths = [
        os.path.join(BASE_DIR, '2nabiji.xlsx - Sheet1.csv'),
        os.path.join(BASE_DIR, '2nabiji.csv')
    ]
    for path in paths:
        if os.path.exists(path):
            return path
    return None

def clean_float(val):
    try: return float(val) if val else 0.0
    except: return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_categories', methods=['GET'])
def get_categories():
    path = get_csv_path()
    if not path: return jsonify([])
    try:
        df = pd.read_csv(path)
        categories = df['category'].dropna().unique().tolist()
        return jsonify(categories)
    except:
        return jsonify([])

@app.route('/get_promos', methods=['GET'])
def get_promos():
    path = get_csv_path()
    if not path: return jsonify([])
    try:
        df = pd.read_csv(path)
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
        csv_path = get_csv_path()
        
        if not csv_path:
            return jsonify({"error": f"ფაილი სახელით '2nabiji.xlsx - Sheet1.csv' ვერ მოიძებნა პროექტის მთავარ საქაღალდეში"}), 404

        df = pd.read_csv(csv_path)
        
        selected_cats = data.get('categories', [])
        filter_mode = data.get('filterMode', 'include')
        
        if selected_cats:
            if filter_mode == 'include':
                df = df[df['category'].isin(selected_cats)]
            else:
                df = df[~df['category'].isin(selected_cats)]

        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price']
        for col in numeric_cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p, t_c, t_f, t_cal = [clean_float(data.get(k)) for k in ['protein', 'carbs', 'fat', 'calories']]
        
        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        # პრომოების დამუშავება
        for promo in data.get('selectedPromos', []):
            final_items.append({
                "name": f"⭐ {promo['product']}", 
                "display": "პრომო შეთავაზება", 
                "cost": clean_float(promo['price'])
            })
            # პრომოების კალორიების დათვლა (ვუშვებთ რომ 1 ერთეულია)
            u_w = clean_float(promo.get('unit_weight', 100))
            totals['p'] += (clean_float(promo['protein']) * u_w) / 100
            totals['f'] += (clean_float(promo['fat']) * u_w) / 100
            totals['c'] += (clean_float(promo['carbs']) * u_w) / 100
            totals['cal'] += (clean_float(promo['calories']) * u_w) / 100
            total_spending += clean_float(promo['price'])

        # ოპტიმიზაცია დანარჩენ პროდუქტებზე
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        if not opt_df.empty:
            costs = (opt_df['price'] / 10).tolist()
            A_ub, b_ub = [], []
            
            # დარჩენილი ნორმები
            rem_p = t_p - totals['p']
            rem_c = t_c - totals['c']
            rem_f = t_f - totals['f']
            rem_cal = t_cal - totals['cal']

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
                        final_items.append({
                            "name": row['product'], 
                            "display": f"აწონე ~{round(f_grams)}გ", 
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

@app.route('/generate_recipe', methods=['POST'])
def generate_recipe():
    data = request.get_json()
    items = data.get('items', [])
    prompt = f"შექმენი მოკლე რეცეპტი ამ ინგრედიენტებით: {', '.join([i['name'] for i in items])}. დაიცავი გრამატიკა და ქართული შრიფტი."
    try:
        response = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": prompt}])
        return jsonify({"recipe": response.choices[0].message.content})
    except:
        return jsonify({"recipe": "რეცეპტის გენერირება ვერ მოხერხდა."})

if __name__ == '__main__':
    app.run(debug=True)
