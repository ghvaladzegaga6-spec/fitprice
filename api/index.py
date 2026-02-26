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
        # ვასუფთავებთ სვეტებს
        cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        # მონაცემების წამოღება
        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))
        t_cal = clean_float(data.get('calories'))

        costs = (df['price'] / 1000).tolist()

        A_ub = []
        b_ub = []

        # მაკროების შეზღუდვები
        if t_p > 0: A_ub.append((-df['protein']).tolist()); b_ub.append(-t_p)
        if t_c > 0: A_ub.append((-df['carbs']).tolist()); b_ub.append(-t_c)
        if t_f > 0: A_ub.append((-df['fat']).tolist()); b_ub.append(-t_f)

        # კალორიების შეზღუდვა (მხოლოდ თუ კალორიაა მითითებული)
        if t_cal > 0:
            A_ub.append((-df['calories']).tolist())
            b_ub.append(-t_cal * 0.95)
            A_ub.append(df['calories'].tolist())
            b_ub.append(t_cal * 1.05)

        if not A_ub:
            return jsonify({"error": "შეავსეთ კალორიების ან მაკროების ველი"}), 400

        # ოპტიმიზაცია
        res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        if not res.success:
            return jsonify({"error": "ვარიანტი ვერ მოიძებნა. შეცვალეთ ციფრები."}), 400

        final_items = []
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
        total_spending = 0

        for i, x in enumerate(res.x):
            grams = x * 100
            if grams < 10: continue 
            
            row = df.iloc[i]
            if grams < 100: grams = 100
            if grams > 300: grams = 300

            # ვამოწმებთ unit_weight-ს რომ შეცდომა არ მოგვცეს
            u_w = float(row.get('unit_weight', 0))
            p_type = str(row.get('pricing_type', 'weight'))

            if p_type == 'piece' and u_w > 0:
                count = max(1, round(grams / u_w))
                final_grams = count * u_w
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
        # ეს დაგვეხმარება Vercel-ის ლოგებში შეცდომის დანახვაში
        print(f"Error: {str(e)}")
        return jsonify({"error": "სერვერის შიდა შეცდომა"}), 500
