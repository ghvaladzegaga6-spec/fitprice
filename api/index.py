from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# OpenAI ინიციალიზაცია (მხოლოდ თუ გასაღები არსებობს)
api_key = os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=api_key) if api_key else None

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
    except Exception as e:
        return jsonify([])

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        if not os.path.exists(csv_path):
            return jsonify({"error": "მონაცემთა ბაზა ვერ მოიძებნა"}), 404

        df = pd.read_csv(csv_path)
        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight', 'total_package_weight']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p, t_c, t_f, t_cal = clean_float(data.get('protein')), clean_float(data.get('carbs')), clean_float(data.get('fat')), clean_float(data.get('calories'))

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        # პრომოების ლოგიკა (შენი ორიგინალური კოდი)
        selected_promos = data.get('selectedPromos', [])
        for promo in selected_promos:
            p_weight = clean_float(promo.get('unit_weight')) if promo.get('sale_type') == 'package_pieces' else clean_float(promo.get('total_package_weight'))
            if p_weight == 0: p_weight = 100 

            final_items.append({"name": f"⭐ {promo['product']}", "display": "პრომო შეთავაზება", "cost": clean_float(promo['price'])})
            totals['p'] += (clean_float(promo['protein']) * p_weight) / 100
            totals['f'] += (clean_float(promo['fat']) * p_weight) / 100
            totals['c'] += (clean_float(promo['carbs']) * p_weight) / 100
            totals['cal'] += (clean_float(promo['calories']) * p_weight) / 100
            total_spending += clean_float(promo['price'])

        rem_p, rem_c, rem_f, rem_cal = max(0, t_p - totals['p']), max(0, t_c - totals['c']), max(0, t_f - totals['f']), max(0, t_cal - totals['cal'])

        # ოპტიმიზაცია (შენი ორიგინალური კოდი)
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        if not opt_df.empty:
            costs = (opt_df['price'] / 10).tolist() 
            A_ub, b_ub = [], []
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
                        u_w, s_type = float(row['unit_weight']), str(row['sale_type']).strip().lower()
                        
                        if s_type == 'package_pieces' and u_w > 0:
                            count = max(1, round(grams / u_w))
                            f_grams, cost, txt = count * u_w, float(row['price']), f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                        elif s_type == 'package_weight':
                            f_grams, cost, txt = grams, float(row['price']), f"იყიდე 1 შეკვრა (გამოიყენე ~{round(grams)}გ)"
                        else:
                            f_grams = max(100, grams)
                            cost, txt = (float(row['price']) * f_grams) / 1000, f"აწონე ~{round(f_grams)}გ"

                        final_items.append({"name": row['product'], "display": txt, "cost": round(cost, 2)})
                        totals['p'] += (row['protein'] * f_grams) / 100
                        totals['f'] += (row['fat'] * f_grams) / 100
                        totals['c'] += (row['carbs'] * f_grams) / 100
                        totals['cal'] += (row['calories'] * f_grams) / 100
                        total_spending += cost

        return jsonify({"items": final_items, "total_cost": round(total_spending, 2), "totals": {k: round(v, 1) for k, v in totals.items()}})
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/get_recipe', methods=['POST'])
def get_recipe():
    if not client: return jsonify({"error": "AI key missing"}), 500
    try:
        data = request.get_json()
        basket = ", ".join([i['name'] for i in data.get('items', [])])
        
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        df = pd.read_csv(csv_path)
        cheap_db = df.sort_values(by='price').head(10)[['product', 'price', 'calories', 'protein', 'fat', 'carbs']].to_string()

        prompt = f"""
        მომხმარებელმა იყიდა: {basket}.
        დაწერე უმარტივესი რეცეპტი. თუ ინგრედიენტები არ გყოფნის, აირჩიე ამ სიიდან ყველაზე იაფი:
        {cheap_db}
        თუ რამეს დაამატებ, დაწერე: "თუ შეიძენ [პროდუქტს], შეძლებ მოამზადო..." 
        ბოლოში დაწერე დამატებითი ხარჯი, კალორიები და მაკროები.
        """

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        return jsonify({"recipe": response.choices[0].message.content})
    except Exception as e: return jsonify({"error": str(e)}), 500
