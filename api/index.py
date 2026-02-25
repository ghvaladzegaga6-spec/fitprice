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

        # 1. ოპტიმიზაციის მიზანი: ფასი 1 გრამზე
        costs = []
        for _, row in df.iterrows():
            if row['pricing_type'] == 'piece' and row['unit_weight'] > 0:
                # მაგ: კვერცხი (10ც) იწონის 500გ-ს. 1გ-ის ფასი = 4.5/500
                total_pkg_weight = row['unit_weight'] * 10 
                costs.append(row['price'] / total_pkg_weight)
            else:
                costs.append(row['price'] / 1000)

        # 2. ოპტიმიზაციის ფუნქცია მკაცრი 300გ-იანი ლიმიტით (bounds=(0, 3.0))
        def solve_diet(tolerance):
            A_ub = [
                df['protein'].tolist(), [-p for p in df['protein'].tolist()],
                df['carbs'].tolist(), [-c for c in df['carbs'].tolist()],
                df['fat'].tolist(), [-f for f in df['fat'].tolist()]
            ]
            b_ub = [
                target_p * (1 + tolerance), -target_p * (1 - tolerance),
                target_c * (1 + tolerance), -target_c * (1 - tolerance),
                target_f * (1 + tolerance), -target_f * (1 - tolerance)
            ]
            # bounds=(0, 3.0) ნიშნავს, რომ ვერცერთი პროდუქტი ვერ იქნება 300გ-ზე მეტი
            return linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        # ვცდილობთ ჯერ მაღალი სიზუსტით (4%), მერე შედარებით დაბლით (10%)
        res = solve_diet(0.04)
        if not res.success:
            res = solve_diet(0.10)

        if not res.success:
            return jsonify({"error": "მოთხოვნილი მაკროების დასმა [150გ-300გ] დიაპაზონში შეუძლებელია."})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            grams = x * 100
            row = df.iloc[i]
            
            # ინდივიდუალური ფილტრი: მინიმუმ 150გ
            if grams < 145: # მცირე დაშვება დამრგვალებისთვის
                continue

            unit_w = float(row['unit_weight'])
            is_piece = row['pricing_type'] == 'piece'

            if is_piece:
                cost = float(row['price']) # მთლიანი შეკვრის ფასი
                if unit_w > 0:
                    # ვითვლით რამდენი ცალია საჭირო
                    count = round(grams / unit_w)
                    # თუ რაოდენობამ გადააჭარბა 300გ-ს, ჩამოგვყავს ლიმიტამდე
                    if (count * unit_w) > 300:
                        count = int(300 / unit_w)
                    if count == 0: count = 1
                    instr = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                    # ვიყენებთ რეალურ წონას მაკროების დასათვლელად
                    final_grams = count * unit_w
                else:
                    instr = f"იყიდე 1 შეკვრა (გამოიყენე ~{round(grams)}გ)"
                    final_grams = grams
            else:
                cost = (float(row['price']) * grams) / 1000
                instr = f"აწონე ~{round(grams)}გ"
                final_grams = grams

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
        return jsonify({"error": f"შეცდომა: {str(e)}"}), 500
