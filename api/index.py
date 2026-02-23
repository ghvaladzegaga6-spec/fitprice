from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
import math

app = Flask(__name__, template_folder='../templates')

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
        df = pd.read_csv('2nabiji.csv')
        
        # მონაცემების გასუფთავება NaN-ებისგან
        for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        target = {
            'p': clean_float(data.get('protein')),
            'f': clean_float(data.get('fat')),
            'c': clean_float(data.get('carbs')),
            'cal': clean_float(data.get('calories'))
        }
        budget_input = data.get('budget')
        budget = clean_float(budget_input)

        # მიზანი: მინიმალური ფასი
        obj = []
        for _, row in df.iterrows():
            p_100 = row['price'] if row['pricing_type'] == 'piece' else row['price'] / 10
            obj.append(p_100)

        # შეზღუდვები (რომ მაკროებს არ გადააცილოს ძლიერად)
        # ვიყენებთ "ნაკლებობას ან ტოლობას", რომ ზუსტად მოვარტყათ
        A_eq = [
            df['protein'].tolist(),
            df['fat'].tolist(),
            df['carbs'].tolist()
        ]
        b_eq = [target['p'], target['f'], target['c']]

        # ამოხსნა (0-დან 10-მდე, ანუ მაქს 1კგ პროდუქტზე)
        res = linprog(c=obj, A_eq=A_eq, b_eq=b_eq, bounds=(0, 10), method='highs')

        if not res.success:
            # თუ ზუსტი დამთხვევა შეუძლებელია, ვუშვებთ მცირე გადაცდომას (>=)
            res = linprog(c=obj, A_ub=[[-x for x in row] for row in A_eq], b_ub=[-x for x in b_eq], bounds=(0, 10), method='highs')

        final_items = []
        total_spending = 0
        actual_macros = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, amount in enumerate(res.x):
            if amount > 0.05: # თუ მინიმუმ 5გ მაინც არის საჭირო
                row = df.iloc[i]
                grams_needed = amount * 100
                
                if row['pricing_type'] == 'piece':
                    # მაღაზიაში ყიდულობ მთლიან შეკვრას
                    cost_to_pay = row['price']
                    instr = f"იყიდე 1 შეკვრა (გამოიყენე {round(grams_needed)}გ)"
                else:
                    # აწონადი პროდუქტი
                    cost_to_pay = (row['price'] * grams_needed) / 1000
                    instr = f"აწონე ~{round(grams_needed)}გ"

                final_items.append({
                    "name": row['product'],
                    "display": instr,
                    "cost": round(cost_to_pay, 2)
                })
                
                total_spending += cost_to_pay
                actual_macros['p'] += (row['protein'] * grams_needed) / 100
                actual_macros['f'] += (row['fat'] * grams_needed) / 100
                actual_macros['c'] += (row['carbs'] * grams_needed) / 100
                actual_macros['cal'] += (row['calories'] * grams_needed) / 100

        is_budget_ok = True if not str(budget_input).strip() else total_spending <= budget

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v) for k, v in actual_macros.items()},
            "is_ok": is_budget_ok
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400
