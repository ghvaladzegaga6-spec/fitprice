from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os

app = Flask(__name__)

def clean_float(val):
    try:
        return float(val) if val else 0.0
    except:
        return 0.0

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(os.path.dirname(__file__), '..', '2nabiji.csv')
        
        if not os.path.exists(csv_path):
            return jsonify({"error": "CSV ფაილი ვერ მოიძებნა"}), 404
            
        df = pd.read_csv(csv_path)

        # მონაცემების მომზადება
        for col in ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))

        # ოპტიმიზაციის მიზანი: მინიმალური ფასი
        costs = (df['price'] / 1000).tolist()

        # შეზღუდვები: >= target
        A_ub = []
        b_ub = []
        if t_p > 0: A_ub.append((-df['protein']).tolist()); b_ub.append(-t_p)
        if t_c > 0: A_ub.append((-df['carbs']).tolist()); b_ub.append(-t_c)
        if t_f > 0: A_ub.append((-df['fat']).tolist()); b_ub.append(-t_f)

        # Bounds: [0, 3.0] (0-300გ)
        # ვიყენებთ მეთოდს, რომელიც უფრო სტაბილურია (interior-point ან highs)
        res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        # თუ მკაცრად ვერ იპოვა, ვხსნით bounds-ს (500გ-მდე)
        if not res.success:
            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5.0), method='highs')

        if not res.success or res.x is None:
            return jsonify({"error": "მოთხოვნილი მაკროების შევსება შეუძლებელია. სცადეთ ციფრების შემცირება."})

        final_items = []
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
        total_spending = 0

        # შედეგების დამუშავება
        for i, x in enumerate(res.x):
            grams = x * 100
            if grams < 40: continue # 40გ-ზე ნაკლებს საერთოდ არ განვიხილავთ
            
            row = df.iloc[i]
            # ახალი 100გ-იანი ბარიერი
            if grams < 100: grams = 100
            
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
                "cost": round(item_cost, 2),
                "macros": {"p": row['protein'], "c": row['carbs'], "f": row['fat']} # დებაგისთვის
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
        # ეს დაგვიბრუნებს რეალურ შეცდომას 500-ის ნაცვლად
        return jsonify({"error": f"ლოგიკური შეცდომა: {str(e)}"}), 200
