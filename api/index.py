from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os

app = Flask(__name__, template_folder='../templates')

def clean_float(val):
    try:
        return float(val) if val else 0.0
    except:
        return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        current_dir = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(current_dir, '..', '2nabiji.csv')
        
        if not os.path.exists(csv_path):
            return jsonify({"error": "ბაზა ვერ მოიძებნა"}), 404

        df = pd.read_csv(csv_path)
        for col in ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))

        # მიზანი: მინიმალური ფასი
        costs = (df['price'] / 1000).tolist()

        # შეზღუდვები: უნდა იყოს მინიმუმ იმდენი, რამდენიც ითხოვე (>= Target)
        A_ub = []
        b_ub = []
        if t_p > 0: A_ub.append((-df['protein']).tolist()); b_ub.append(-t_p)
        if t_c > 0: A_ub.append((-df['carbs']).tolist()); b_ub.append(-t_c)
        if t_f > 0: A_ub.append((-df['fat']).tolist()); b_ub.append(-t_f)

        # Bounds: [1.0, 3.0] ნიშნავს მინიმუმ 100გ და მაქსიმუმ 300გ-ს
        # იმისათვის, რომ ალგორითმი არ გაიჭედოს, bounds-ს მივცემთ (0, 3.0) 
        # და მინიმუმს კოდით ვაიძულებთ
        res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        # თუ 300გ-ში ფიზიკურად ვერ ეტევა მოთხოვნილი მაკროები
        if not res.success:
            return jsonify({
                "error": "მოთხოვნილი მაკროების შევსება 300გ-იან ლიმიტში შეუძლებელია. შეამცირეთ ციფრები ან დაამატეთ მეტი პროდუქტი."
            }), 400

        final_items = []
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
        total_spending = 0

        for i, x in enumerate(res.x):
            grams = x * 100
            if grams < 10: continue # უმნიშვნელო რაოდენობა
            
            row = df.iloc[i]
            # ვაიძულებთ მინიმუმ 100გ-ს, თუ პროდუქტი შერჩეულია
            if grams < 100: grams = 100
            if grams > 300: grams = 300

            unit_w = float(row['unit_weight'])
            is_piece = row['pricing_type'] == 'piece'

            if is_piece and unit_w > 0:
                count = round(grams / unit_w)
                if count == 0: count = 1
                final_grams = count * unit_w
                item_cost = float(row['price'])
                instr = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
            else:
                final_grams = grams
                item_cost = (float(row['price']) * grams) / 1000
                instr = f"აწონე ~{round(grams)}გ"

            final_items.append({
                "name": str(row['product']),
                "display": instr,
                "cost": round(item_cost, 2)
            })

            totals['p'] += (row['protein'] * final_grams) / 100
            totals['f'] += (row['fat'] * final_grams) / 100
            totals['c'] += (row['carbs'] * final_grams) / 100
            totals['cal'] += (row['calories'] * final_grams) / 100
            total_spending += item_cost

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })

    except Exception as e:
        return jsonify({"error": f"სერვერის შეცდომა: {str(e)}"}), 500
