from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI
import glob

# OpenAI API Key
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# BASE_DIR განსაზღვრავს api/ საქაღალდის ადგილმდებარეობას
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, 
            template_folder=os.path.join(os.path.dirname(BASE_DIR), 'templates'),
            static_folder=os.path.join(os.path.dirname(BASE_DIR), 'static'))

def get_csv_path():
    """
    ეძებს ფაილს data.csv ზუსტად იმავე საქაღალდეში, სადაც index.py დევს
    """
    path = os.path.join(BASE_DIR, "data.csv")
    if os.path.exists(path):
        return path
    
    # სათადარიგო ძებნა იმავე საქაღალდეში ნებისმიერი CSV ფაილისთვის
    files = glob.glob(os.path.join(BASE_DIR, "*.csv"))
    if files:
        return files[0]
        
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
    if not path: 
        return jsonify([])
    try:
        df = pd.read_csv(path)
        df.columns = df.columns.str.strip()
        categories = df['category'].dropna().unique().tolist()
        return jsonify(categories)
    except Exception as e:
        return jsonify([])

@app.route('/get_promos', methods=['GET'])
def get_promos():
    path = get_csv_path()
    if not path: return jsonify([])
    try:
        df = pd.read_csv(path)
        df.columns = df.columns.str.strip()
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
            return jsonify({"error": "მონაცემთა ბაზა (data.csv) ვერ მოიძებნა api/ საქაღალდეში."}), 404

        df = pd.read_csv(csv_path)
        df.columns = df.columns.str.strip()
        
        selected_cats = data.get('categories', [])
        filter_mode = data.get('filterMode', 'include')
        
        if selected_cats:
            if filter_mode == 'include':
                df = df[df['category'].isin(selected_cats)]
            else:
                df = df[~df['category'].isin(selected_cats)]

        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))
        t_cal = clean_float(data.get('calories'))
        
        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for promo in data.get('selectedPromos', []):
            final_items.append({
                "name": f"⭐ {promo['product']}", 
                "display": "პრომო შეთავაზება", 
                "cost": clean_float(promo['price'])
            })
            u_w = clean_float(promo.get('unit_weight', 100))
            totals['p'] += (clean_float(promo['protein']) * u_w) / 100
            totals['f'] += (clean_float(promo['fat']) * u_w) / 100
            totals['c'] += (clean_float(promo['carbs']) * u_w) / 100
            totals['cal'] += (clean_float(promo['calories']) * u_w) / 100
            total_spending += clean_float(promo['price'])

        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        if not opt_df.empty:
            costs = (opt_df['price'] / 10).tolist()
            A_ub, b_ub = [], []
            
            rem_p = max(0, t_p - totals['p'])
            rem_c = max(0, t_c - totals['c'])
            rem_f = max(0, t_f - totals['f'])
            rem_cal = max(0, t_cal - totals['cal'])

            if t_p > 0: A_ub.append((-opt_df['protein']).tolist()); b_ub.append(-rem_p)
            if t_c > 0: A_ub.append((-opt_df['carbs']).tolist()); b_ub.append(-rem_c)
            if t_f > 0: A_ub.append((-opt_df['fat']).tolist()); b_ub.append(-rem_f)
            if t_cal > 0:
                A_ub.append((-opt_df['calories']).tolist()); b_ub.append(-rem_cal * 0.95)
                A_ub.append(opt_df['calories'].tolist()); b_ub.append(rem_cal * 1.05)

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
    if not items: return jsonify({"recipe": "კალათა ცარიელია."})
    
    prompt = f"მოიფიქრე ჯანსაღი კერძის რეცეპტი ამ პროდუქტებისგან: {', '.join([i['name'] for i in items])}. იყავი მოკლე და კონკრეტული."
    try:
        response = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": prompt}])
        return jsonify({"recipe": response.choices[0].message.content})
    except:
        return jsonify({"recipe": "რეცეპტის გენერირება ამჟამად შეუძლებელია."})

if __name__ == '__main__':
    app.run(debug=True)
