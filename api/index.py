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
        
        target = {
            'p': clean_float(data.get('protein')),
            'f': clean_float(data.get('fat')),
            'c': clean_float(data.get('carbs'))
        }
        budget_input = data.get('budget')
        budget = clean_float(budget_input)

        obj = []
        bounds = []
        for _, row in df.iterrows():
            # ფასი 100 გრამზე
            p_100 = row['price'] if row['pricing_type'] == 'piece' else row['price'] / 10
            obj.append(p_100)
            
            # კრიტიკული ცვლილება: თუ 'piece'-ია, მინიმუმ 1 შეკვრა (დაახლოებით 4-5 ერთეული 100გ-იანი)
            if row['pricing_type'] == 'piece':
                bounds.append((4.0, 10.0)) # მინიმუმ 400გ (1 შეკვრა), მაქს 1კგ
            else:
                bounds.append((0.5, 10.0)) # წონითი: მინიმუმ 50გ

        lhs_ineq = [
            [-x for x in df['protein'].values],
            [-x for x in df['fat'].values],
            [-x for x in df['carbs'].values]
        ]
        rhs_ineq = [-target['p'], -target['f'], -target['c']]

        res = linprog(c=obj, A_ub=lhs_ineq, b_ub=rhs_ineq, bounds=bounds, method='highs')

        if not res.success:
            return jsonify({"error": "შეუძლებელია ამ მაკროების შევსება. გაზარდეთ სამიზნე მაკროები."})

        final_items = []
        total_cost = 0
        actual_macros = {'p': 0, 'f': 0, 'c': 0}

        for i, amount in enumerate(res.x):
            if amount > 0.1:
                row = df.iloc[i]
                grams = amount * 100
                
                if row['pricing_type'] == 'piece':
                    # ვამრგვალებთ შეკვრებამდე. მაგ. 16.40 ლარი
                    units = math.ceil(grams / 500) # ვთვლით რომ შეკვრა საშუალოდ 500გ-ია
                    cost = units * row['price']
                    display = f"იყიდე {units} შეკვრა (სრულად)"
                else:
                    cost = (row['price'] * grams) / 1000
                    display = f"აწონე ~{round(grams)}გ"
                
                final_items.append({
                    "name": row['product'],
                    "display": display,
                    "cost": round(cost, 2)
                })
                total_cost += cost
                actual_macros['p'] += (row['protein'] * grams) / 100
                actual_macros['f'] += (row['fat'] * grams) / 100
                actual_macros['c'] += (row['carbs'] * grams) / 100

        # ბიუჯეტის ლოგიკა: თუ ველი ცარიელი იყო (budget_input == ""), ყოველთვის True-ა
        is_budget_ok = True if not str(budget_input).strip() else total_cost <= budget

        return jsonify({
            "items": final_items,
            "total_cost": round(total_cost, 2),
            "totals": {k: round(v) for k, v in actual_macros.items()},
            "is_ok": is_budget_ok
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400
