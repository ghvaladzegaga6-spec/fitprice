from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')

app = Flask(__name__, template_folder=TEMPLATE_DIR)

def clean_float(val):
    try:
        return float(val) if val and str(val).strip() != "" else 0.0
    except:
        return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        df = pd.read_csv(csv_path)

        cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        target_p = clean_float(data.get('protein'))
        target_c = clean_float(data.get('carbs'))
        target_f = clean_float(data.get('fat'))
        target_cal = clean_float(data.get('calories'))

        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()

        # ფასი 1 გრამზე ოპტიმიზაციისთვის
        costs = []
        for _, row in df.iterrows():
            if row['pricing_type'] == 'piece' and row['unit_weight'] > 0:
                total_pkg_weight = row['unit_weight'] * 10 
                costs.append(row['price'] / total_pkg_weight)
            else:
                costs.append(row['price'] / 1000)

        # შეზღუდვების მატრიცა: მაკროები უნდა იყოს >= მოთხოვნილზე
        # linprog მუშაობს <= პრინციპით, ამიტომ ციფრებს ვამრავლებთ -1-ზე
        A_ub = []
        b_ub = []

        if target_cal > 0:
            A_ub.append((-df['calories']).tolist())
            b_ub.append(-target_cal)
        else:
            if target_p > 0:
                A_ub.append((-df['protein']).tolist())
                b_ub.append(-target_p)
            if target_c > 0:
                A_ub.append((-df['carbs']).tolist())
                b_ub.append(-target_c)
            if target_f > 0:
                A_ub.append((-df['fat']).tolist())
                b_ub.append(-target_f)

        # Bounds: თითოეული პროდუქტი მაქსიმუმ 300გ (3.0 ერთეული)
        res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        if not res.success:
            return jsonify({"error": "შეუძლებელია ამ მაკროების შევსება [150გ-300გ] ლიმიტით. სცადეთ სხვა პროდუქტების დამატება ან მაკროების შემცირება."})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            grams = x * 100
            row = df.iloc[i]
            
            # ფილტრი: თუ პროდუქტი არჩეულია, უნდა იყოს მინიმუმ 150გ
            if grams < 10: continue 
            if grams < 148: 
                # თუ მათემატიკურად 150გ-ზე ნაკლები სჭირდება, ჩვენ ვაიძულებთ 150გ-მდე აწიოს
                grams = 150.0

            unit_w = float(row['unit_weight'])
            is_piece = row['pricing_type'] == 'piece'

            if is_piece and unit_w > 0:
                count = round(grams / unit_w)
                if count == 0: count = 1
                if (count * unit_w) > 300: count = int(300 / unit_w)
                instr = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                final_grams = count * unit_w
                cost = float(row['price'])
            else:
                instr = f"აწონე ~{round(grams)}გ"
                final_grams = grams
                cost = (float(row['price']) * grams) / 1000

            final_items.append({
                "name": str(row['product']),
                "display": instr,
                "cost": round(cost, 2)
            })
            
            total_spending += cost
            totals['p'] += (row['protein'] * final_grams) / 100
            totals['f'] += (row['fat'] * final_grams) / 100
            totals['c'] += (row['carbs'] * final_grams) / 100
            totals['cal'] += (row['calories'] * final_grams) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
