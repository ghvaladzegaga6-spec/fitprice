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
            'c': clean_float(data.get('carbs')),
            'cal': clean_float(data.get('calories'))
        }
        budget = clean_float(data.get('budget'))

        obj = []
        for _, row in df.iterrows():
            p = row['price'] if row['pricing_type'] == 'piece' else row['price'] / 10
            obj.append(p)

        lhs_ineq = [
            [-x for x in df['protein'].values],
            [-x for x in df['fat'].values],
            [-x for x in df['carbs'].values]
        ]
        rhs_ineq = [-target['p'], -target['f'], -target['c']]

        # მრავალფეროვნებისთვის: თითოეული პროდუქტი მინიმუმ 50გ (0.5 ერთეული)
        bounds = [(0.5, 5) for _ in range(len(df))]

        res = linprog(c=obj, A_ub=lhs_ineq, b_ub=rhs_ineq, bounds=bounds, method='highs')

        if not res.success:
            # თუ მრავალფეროვნებით ვერ ხსნის, ვცადოთ ისევ თავისუფლად (0-დან)
            res = linprog(c=obj, A_ub=lhs_ineq, b_ub=rhs_ineq, bounds=(0, 5), method='highs')

        final_items = []
        total_cost = 0
        actual_macros = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, amount in enumerate(res.x):
            if amount > 0.1:
                row = df.iloc[i]
                grams = amount * 100
                cost = amount * (row['price'] if row['pricing_type'] == 'piece' else row['price']/10)
                
                final_items.append({
                    "name": row['product'],
                    "display": f"იყიდე ~{round(grams)}გ",
                    "cost": round(cost, 2)
                })
                total_cost += cost
                actual_macros['p'] += (row['protein'] * grams) / 100
                actual_macros['f'] += (row['fat'] * grams) / 100
                actual_macros['c'] += (row['carbs'] * grams) / 100

        # ბიუჯეტის ლოგიკის შესწორება
        is_budget_ok = True if budget <= 0 else total_cost <= budget

        return jsonify({
            "items": final_items,
            "total_cost": round(total_cost, 2),
            "totals": {k: round(v) for k, v in actual_macros.items()},
            "is_ok": is_budget_ok
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400
