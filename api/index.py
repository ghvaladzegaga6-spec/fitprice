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

        # სექციის ფილტრი
        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()
            if df.empty:
                return jsonify({"error": f"სექციაში '{category}' პროდუქტები არ არის."})

        # მონაცემების ტიპების გასწორება
        for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        target_cal = clean_float(data.get('calories'))
        target_p = clean_float(data.get('protein'))
        target_c = clean_float(data.get('carbs'))
        target_f = clean_float(data.get('fat'))

        # ოპტიმიზაციის მიზანი: მინიმალური ფასი (ფასი მოცემულია 100გ-ზე)
        obj = (df['price'] / 10).tolist() 

        # შეზღუდვების მატრიცები
        A_ub = []
        b_ub = []

        if target_cal > 0:
            # კალორიების დიაპაზონი (მიზნობრივი +- 5%)
            A_ub.append(df['calories'].tolist())
            b_ub.append(target_cal * 1.05)
            A_ub.append((-df['calories']).tolist())
            b_ub.append(-target_cal * 0.95)
        else:
            # მაკროების დიაპაზონი (მიზნობრივი +- 10%)
            # ცილა
            A_ub.append(df['protein'].tolist())
            b_ub.append(target_p * 1.1)
            A_ub.append((-df['protein']).tolist())
            b_ub.append(-target_p * 0.9)
            # ნახშირწყალი
            A_ub.append(df['carbs'].tolist())
            b_ub.append(target_c * 1.1)
            A_ub.append((-df['carbs']).tolist())
            b_ub.append(-target_c * 0.9)
            # ცხიმი
            A_ub.append(df['fat'].tolist())
            b_ub.append(target_f * 1.1)
            A_ub.append((-df['fat']).tolist())
            b_ub.append(-target_f * 0.9)

        # ამოხსნა (ლიმიტი: თითო პროდუქტი მაქსიმუმ 500გ)
        res = linprog(c=obj, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')

        if not res.success:
            return jsonify({"error": "მოთხოვნილი მაკროებით ბიუჯეტური გეგმა ვერ შედგა. სცადეთ სხვა მონაცემები."})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            if x > 0.01: # თუ პროდუქტი მინიმუმ 1გ-ია
                row = df.iloc[i]
                grams = x * 100
                
                if row['pricing_type'] == 'piece':
                    cost = float(row['price'])
                    instr = f"იყიდე 1 ცალი (გამოიყენე {round(grams)}გ)"
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

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })

    except Exception as e:
        return jsonify({"error": f"შეცდომა: {str(e)}"}), 500
