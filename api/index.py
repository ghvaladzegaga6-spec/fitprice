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
        
        if not os.path.exists(csv_path):
            return jsonify({"error": "მონაცემთა ბაზა ვერ მოიძებნა"}), 404
            
        df = pd.read_csv(csv_path)

        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()
            if df.empty:
                return jsonify({"error": f"სექციაში '{category}' პროდუქტები არ არის."})

        cols_to_fix = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in cols_to_fix:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
            else:
                df[col] = 0.0

        target_p = clean_float(data.get('protein'))
        target_c = clean_float(data.get('carbs'))
        target_f = clean_float(data.get('fat'))
        target_cal = clean_float(data.get('calories'))

        obj = (df['price'] / 10).tolist() 

        A_ub = []
        b_ub = []

        # მაკროების შეზღუდვები (±15% დიაპაზონი)
        if target_cal > 0:
            A_ub.append(df['calories'].tolist()); b_ub.append(target_cal * 1.1)
            A_ub.append((-df['calories']).tolist()); b_ub.append(-target_cal * 0.9)
        else:
            A_ub.append(df['protein'].tolist()); b_ub.append(target_p * 1.15)
            A_ub.append((-df['protein']).tolist()); b_ub.append(-target_p * 0.85)
            A_ub.append(df['carbs'].tolist()); b_ub.append(target_c * 1.15)
            A_ub.append((-df['carbs']).tolist()); b_ub.append(-target_c * 0.85)
            A_ub.append(df['fat'].tolist()); b_ub.append(target_f * 1.15)
            A_ub.append((-df['fat']).tolist()); b_ub.append(-target_f * 0.85)

        # მინიმუმ 200გ (2 ერთეული) და მაქსიმუმ 500გ (5 ერთეული)
        # შენიშვნა: linprog ყოველთვის 0-დან იწყებს, ამიტომ ქვედა ზღვარს 
        # შედეგების დამუშავებისას უფრო მკაცრად გავფილტრავთ.
        res = linprog(c=obj, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')

        if not res.success:
            # თუ 500გ-იანი ლიმიტით ვერ იპოვა, ვზრდით ლიმიტს 1კგ-მდე (10 ერთეული)
            res = linprog(c=obj, A_ub=A_ub, b_ub=b_ub, bounds=(0, 10), method='highs')

        if not res.success:
            return jsonify({"error": "ბიუჯეტური გეგმა ვერ შედგა. სცადეთ მაკროების შეცვლა."})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            # ფილტრი: მხოლოდ პროდუქტები, რომლებიც მინიმუმ 200 გრამია (x >= 2.0)
            # გამონაკლისი: კვერცხი და ცალობითი პროდუქტები (შეიძლება 200გ-ზე ნაკლები იყოს)
            grams = x * 100
            row = df.iloc[i]
            is_piece = row['pricing_type'] == 'piece'
            
            if grams >= 195 or (is_piece and grams > 10): 
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
                    "cost": round(cost, 2)
                })
                
                total_spending += cost
                totals['p'] += (row['protein'] * grams) / 100
                totals['f'] += (row['fat'] * grams) / 100
                totals['c'] += (row['carbs'] * grams) / 100
                totals['cal'] += (row['calories'] * grams) / 100

        if not final_items:
            return jsonify({"error": "ვერ მოიძებნა პროდუქტები, რომლებიც 200-500გ ფარგლებში აკმაყოფილებენ მოთხოვნას."})

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })

    except Exception as e:
        return jsonify({"error": f"შეცდომა: {str(e)}"}), 500
