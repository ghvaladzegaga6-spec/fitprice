from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# OpenAI კონფიგურაცია
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
        
        for col in ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_cal = clean_float(data.get('calories'))
        t_p = clean_float(data.get('protein'))

        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        costs = (opt_df['price'] / 10).tolist()
        A_ub = [(-opt_df['protein']).tolist(), (-opt_df['calories']).tolist(), opt_df['calories'].tolist()]
        b_ub = [-t_p, -t_cal * 0.95, t_cal * 1.05]

        final_items = []
        res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5.0), method='highs')
        
        if res.success:
            for i, x in enumerate(res.x):
                grams = x * 100
                if grams < 30: continue
                row = opt_df.iloc[i]
                u_w = float(row['unit_weight'])
                prod_name = str(row['product']).lower()
                
                # კვერცხის და ცალობითი პროდუქტების ლოგიკა
                if "კვერცხი" in prod_name or u_w > 0:
                    weight_per_unit = u_w if u_w > 0 else 50 # თუ წონა არ წერია, ვთვლით 50გ
                    count = max(1, round(grams / weight_per_unit))
                    txt = f"იყიდე {count} ცალი"
                    # ფასი ითვლება კილოგრამის ფასიდან გამომდინარე
                    cost = (row['price'] / 1000) * (count * weight_per_unit)
                else:
                    txt = f"აწონე ~{round(grams)}გ"
                    cost = (row['price'] * grams) / 1000

                final_items.append({"name": row['product'], "display": txt, "cost": round(cost, 2)})

        return jsonify({
            "items": final_items,
            "total_cost": round(sum(i['cost'] for i in final_items), 2),
            "totals": {"cal": t_cal, "p": t_p}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_recipe', methods=['POST'])
def get_recipe():
    try:
        data = request.get_json()
        items = ", ".join([i['name'] for i in data.get('items', [])])
        
        # ვიყენებთ GPT-4o-mini-ს (ყველაზე სწრაფი და იაფია)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "შენ ხარ ქართველი შეფ-მზარეული. მოიფიქრე 1 რეალური რეცეპტი მოცემული პროდუქტებით. დაწერე გასაგები ქართულით, მოკლედ, ეტაპობრივად."},
                {"role": "user", "content": f"პროდუქტები: {items}. დაწერე რეცეპტი."}
            ]
        )
        return jsonify({"recipe": response.choices[0].message.content})
    except Exception as e:
        return jsonify({"error": "OpenAI-სთან დაკავშირება ვერ მოხერხდა. შეამოწმე ბალანსი."}), 500
