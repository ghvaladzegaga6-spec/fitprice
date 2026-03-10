from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# პროექტის მისამართები
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- OPENAI კონფიგურაცია ---
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

def clean_float(val):
    try: return float(val) if val else 0.0
    except: return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_promos', methods=['GET'])
def get_promos():
    try:
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        if not os.path.exists(csv_path): return jsonify([])
        df = pd.read_csv(csv_path)
        promo_df = df[df['is_promo'] == 1]
        return jsonify(promo_df.sample(n=min(3, len(promo_df))).to_dict(orient='records'))
    except: return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        df = pd.read_csv(csv_path)
        
        for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))
        t_cal = clean_float(data.get('calories'))

        # ოპტიმიზაციის ლოგიკა
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        costs = (opt_df['price'] / 10).tolist()
        A_ub, b_ub = [], []
        
        if t_p > 0: A_ub.append((-opt_df['protein']).tolist()); b_ub.append(-t_p)
        if t_c > 0: A_ub.append((-opt_df['carbs']).tolist()); b_ub.append(-t_c)
        if t_f > 0: A_ub.append((-opt_df['fat']).tolist()); b_ub.append(-t_f)
        if t_cal > 0:
            A_ub.append((-opt_df['calories']).tolist()); b_ub.append(-t_cal * 0.95)
            A_ub.append(opt_df['calories'].tolist()); b_ub.append(t_cal * 1.05)

        final_items = []
        if A_ub:
            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5.0), method='highs')
            if res.success:
                for i, x in enumerate(res.x):
                    if x * 100 < 50: continue
                    row = opt_df.iloc[i]
                    final_items.append({
                        "name": row['product'],
                        "display": f"აწონე ~{round(x*100)}გ",
                        "cost": round((row['price'] * x * 100) / 1000, 2)
                    })

        return jsonify({
            "items": final_items,
            "total_cost": sum(i['cost'] for i in final_items),
            "totals": {"p": t_p, "f": t_f, "c": t_c, "cal": t_cal}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_recipe', methods=['POST'])
def get_recipe():
    try:
        data = request.get_json()
        items = data.get('items', [])
        items_str = ", ".join([i['name'] for i in items])
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "შენ ხარ ქართველი მზარეული. მოიფიქრე მოკლე რეცეპტი."},
                {"role": "user", "content": f"პროდუქტები: {items_str}. დაწერე რეცეპტი ქართულად."}
            ]
        )
        return jsonify({"recipe": response.choices[0].message.content})
    except Exception as e:
        return jsonify({"error": f"ChatGPT შეცდომა: {str(e)}"}), 500
