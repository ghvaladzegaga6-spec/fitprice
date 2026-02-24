from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os

app = Flask(__name__, template_folder='../templates')

def clean_float(val):
    try:
        return float(val) if val and str(val).strip() != "" else 0.0
    except:
        return 0.0

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        df = pd.read_csv('2nabiji.csv')
        
        # კატეგორიის ფილტრი
        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category]
            if df.empty:
                return jsonify({"error": f"სექციაში '{category}' პროდუქტები ვერ მოიძებნა."})

        # მონაცემების ტიპები
        for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # რომელი ვარიანტი აირჩია?
        target_cal = clean_float(data.get('calories'))
        target_p = clean_float(data.get('protein'))
        target_f = clean_float(data.get('fat'))
        target_c = clean_float(data.get('carbs'))

        # მათემატიკური მატრიცის მომზადება
        obj = (df['price'] / 10).tolist() # მიზანია მინიმალური ფასი 100გ-ზე
        
        if target_cal > 0:
            # ვარიანტი 1: კალორიების მიხედვით
            A_eq = [df['calories'].tolist()]
            b_eq = [target_cal]
        else:
            # ვარიანტი 2: მაკროების მიხედვით
            A_eq = [
                df['protein'].tolist(),
                df['fat'].tolist(),
                df['carbs'].tolist()
            ]
            b_eq = [target_p, target_f, target_c]

        # ამოხსნა (ლიმიტი თითოეულ პროდუქტზე: 0-დან 500გ-მდე, ანუ 5 ერთეული 100გ-იანი)
        res = linprog(c=obj, A_eq=A_eq, b_eq=b_eq, bounds=(0, 5), method='highs')

        if not res.success:
            return jsonify({"error": "ვერ მოიძებნა ბიუჯეტური ვერსია ამ მაკროებისთვის."})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            if x > 0.1: # თუ მინიმუმ 10გ-ია
                row = df.iloc[i]
                grams_to_eat = x * 100
                
                if row['pricing_type'] == 'piece':
                    # თუ შეკვრაა: ფასი მთლიანი, მაგრამ ჭამ მხოლოდ იმას რაც საჭიროა (მაქს 500გ)
                    cost = row['price']
                    instr = f"იყიდე 1 შეკვრა (გამოიყენე {round(grams_to_eat)}გ)"
                else:
                    # თუ წონითია
                    cost = (row['price'] * grams_to_eat) / 1000
                    instr = f"აწონე {round(grams_to_eat)}გ"

                final_items.append({"name": row['product'], "display": instr, "cost": round(cost, 2)})
                total_spending += cost
                totals['p'] += (row['protein'] * grams_to_eat) / 100
                totals['f'] += (row['fat'] * grams_to_eat) / 100
                totals['c'] += (row['carbs'] * grams_to_eat) / 100
                totals['cal'] += (row['calories'] * grams_to_eat) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v) for k, v in totals.items()}
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400
