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

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        df = pd.read_csv(csv_path)

        # ტიპების გასწორება
        cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))

        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()

        # ოპტიმიზაციის მიზანი: მინიმალური ფასი
        # შენიშვნა: ფასს ვანგარიშობთ 1 გრამზე
        costs = (df['price'] / 1000).tolist()

        # შეზღუდვები (Constraints)
        A_ub = []
        b_ub = []

        # მკაცრი მინიმალური მოთხოვნა (მოთხოვნილი მაკროების 100%)
        if t_p > 0: A_ub.append((-df['protein']).tolist()); b_ub.append(-t_p)
        if t_c > 0: A_ub.append((-df['carbs']).tolist()); b_ub.append(-t_c)
        if t_f > 0: A_ub.append((-df['fat']).tolist()); b_ub.append(-t_f)

        # მკაცრი მაქსიმალური ზღვარი (რომ ცდომილება მინიმალური იყოს, მაგ: +5%)
        if t_p > 0: A_ub.append(df['protein'].tolist()); b_ub.append(t_p * 1.05)
        if t_c > 0: A_ub.append(df['carbs'].tolist()); b_ub.append(t_c * 1.05)
        if t_f > 0: A_ub.append(df['fat'].tolist()); b_ub.append(t_f * 1.05)

        # Bounds: [0, 3.0] (მაქსიმუმ 300გ)
        res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        # თუ ძალიან მკაცრი 5%-ით ვერ იპოვა, ვუშვებთ 10%-იან ცდომილებას
        if not res.success:
            b_ub = []
            if t_p > 0: A_ub.append((-df['protein']).tolist()); b_ub.append(-t_p)
            if t_c > 0: A_ub.append((-df['carbs']).tolist()); b_ub.append(-t_c)
            if t_f > 0: A_ub.append((-df['fat']).tolist()); b_ub.append(-t_f)
            # Relaxed bounds (+10%)
            if t_p > 0: A_ub.append(df['protein'].tolist()); b_ub.append(t_p * 1.1)
            if t_c > 0: A_ub.append(df['carbs'].tolist()); b_ub.append(t_c * 1.1)
            if t_f > 0: A_ub.append(df['fat'].tolist()); b_ub.append(t_f * 1.1)
            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        if not res.success:
            return jsonify({"error": "მოთხოვნების სიზუსტით შესრულება 100გ-300გ დიაპაზონში შეუძლებელია."})

        final_items = []
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
        total_spending = 0

        for i, x in enumerate(res.x):
            grams = x * 100
            if grams < 5: continue # იგნორირება თუ პროდუქტი საერთოდ არ აირჩია
            
            row = df.iloc[i]
            
            # ახალი მინიმალური ბარიერი: 100გ
            if grams < 100: grams = 100
            if grams > 300: grams = 300

            unit_w = float(row['unit_weight'])
            is_piece = row['pricing_type'] == 'piece'

            if is_piece and unit_w > 0:
                count = round(grams / unit_w)
                if count == 0: count = 1
                # ვამოწმებთ რომ ცალების წონამაც არ გადააცილოს 300გ-ს
                if (count * unit_w) > 300: count = int(300 / unit_w)
                
                final_grams = count * unit_w
                instr = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                item_cost = float(row['price'])
            else:
                final_grams = grams
                instr = f"აწონე ~{round(grams)}გ"
                item_cost = (float(row['price']) * grams) / 1000

            final_items.append({
                "name": str(row['product']),
                "display": instr,
                "cost": round(item_cost, 2)
            })

            total_spending += item_cost
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
