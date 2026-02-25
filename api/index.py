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

        # მონაცემების ტიპების გასწორება
        cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        target_p = clean_float(data.get('protein'))
        target_c = clean_float(data.get('carbs'))
        target_f = clean_float(data.get('fat'))

        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()

        # ოპტიმიზაციის პარამეტრები
        obj = (df['price'] / 10).tolist()
        
        # სიზუსტის გაზრდა: ცდომილება მცირდება 3%-მდე (0.97 - 1.03)
        A_ub = [
            df['protein'].tolist(), [-p for p in df['protein'].tolist()],
            df['carbs'].tolist(), [-c for c in df['carbs'].tolist()],
            df['fat'].tolist(), [-f for f in df['fat'].tolist()]
        ]
        b_ub = [
            target_p * 1.03, -target_p * 0.97,
            target_c * 1.03, -target_c * 0.97,
            target_f * 1.03, -target_f * 0.97
        ]

        #Bounds: 0 ან 1.5-დან (150გ) 5.0-მდე (500გ)
        # შენიშვნა: linprog-ში მინიმალური ბარიერის (1.5) პირდაპირ ჩაწერა bounds-ში 
        # აიძულებს პროგრამას ყველა პროდუქტი აიღოს. ამიტომ ვიყენებთ ქვემოთ ფილტრს.
        res = linprog(c=obj, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')

        if not res.success:
            # თუ ძალიან მკაცრი სიზუსტით (3%) ვერ იპოვა, ცდის 7%-იან ცდომილებას
            b_ub = [target_p * 1.07, -target_p * 0.93, target_c * 1.07, -target_c * 0.93, target_f * 1.07, -target_f * 0.93]
            res = linprog(c=obj, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')

        if not res.success:
            return jsonify({"error": "შეუძლებელია ამ მაკროების ზუსტად დასმა 150გ-იანი პროდუქტებით. სცადეთ სხვა მონაცემები."})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            grams = x * 100
            row = df.iloc[i]
            is_piece = row['pricing_type'] == 'piece'
            
            # მინიმალური ბარიერი 150გ (ან ცალობითი პროდუქტისთვის 1 ერთეული)
            if grams >= 145 or (is_piece and grams > 10): 
                unit_w = float(row['unit_weight'])
                
                if is_piece:
                    cost = float(row['price'])
                    if unit_w > 0:
                        count = round(grams / unit_w)
                        if count == 0: count = 1
                        instr = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                    else:
                        instr = f"იყიდე 1 შეკვრა (გამოიყენე ~{round(grams)}გ)"
                else:
                    cost = (float(row['price']) * grams) / 1000
                    instr = f"აწონე ~{round(grams)}გ"

                final_items.append({
                    "name": str(row['product']),
                    "display": instr,
                    "cost": round(cost, 2),
                    "grams": round(grams)
                })
                
                total_spending += cost
                totals['p'] += (row['protein'] * grams) / 100
                totals['f'] += (row['fat'] * grams) / 100
                totals['c'] += (row['carbs'] * grams) / 100
                totals['cal'] += (row['calories'] * grams) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
