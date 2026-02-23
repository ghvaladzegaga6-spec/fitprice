from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
import math

app = Flask(__name__)

def clean_float(val):
    try:
        return float(val) if val and str(val).strip() != "" else 0.0
    except:
        return 0.0

def solve_diet_math(budget, target, df):
    # მონაცემების მომზადება
    for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    n_products = len(df)
    
    # მიზანი: მინიმალური ფასი (კვების ღირებულება 100 გრამზე)
    obj = []
    for _, row in df.iterrows():
        # ფასი 100 გრამზე
        price_per_100g = row['price'] if row['pricing_type'] == 'piece' else row['price'] / 10
        obj.append(price_per_100g)

    # შეზღუდვები (მინიმუმ სამიზნე მაკროები)
    # linprog ითხოვს <= შეზღუდვას, ამიტომ ვამრავლებთ -1-ზე
    lhs_ineq = []
    rhs_ineq = []

    # ცილა, ცხიმი, ნახშირწყალი
    lhs_ineq.append([-x for x in df['protein'].values])
    rhs_ineq.append(-target['p'])
    
    lhs_ineq.append([-x for x in df['fat'].values])
    rhs_ineq.append(-target['f'])
    
    lhs_ineq.append([-x for x in df['carbs'].values])
    rhs_ineq.append(-target['c'])

    # რაოდენობის ლიმიტი (Bounds) - თითოეული პროდუქტი 0-დან 500გ-მდე (0-5 ერთეული 100გ-იანი)
    bounds = [(0, 5) for _ in range(n_products)]

    # ამოხსნა
    res = linprog(c=obj, A_ub=lhs_ineq, b_ub=rhs_ineq, bounds=bounds, method='highs')

    if not res.success:
        return {"error": "ვერ მოიძებნა ვარიანტი. სცადეთ ბიუჯეტის გაზრდა."}

    selected_items = []
    total_macros = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
    total_cost = 0

    for i, x in enumerate(res.x):
        if x > 0.1: # თუ მინიმუმ 10გ-ია
            row = df.iloc[i]
            grams = x * 100
            
            if row['pricing_type'] == 'piece':
                units = math.ceil(grams / 150) # პირობითად 1 შეკვრა
                cost = units * row['price']
                display = f"იყიდე {units} შეკვრა (~{round(grams)}გ)"
            else:
                cost = (row['price'] * grams) / 1000
                display = f"აწონე {round(grams)}გ"

            selected_items.append({
                "name": row['product'],
                "display": display,
                "cost": round(cost, 2)
            })
            
            total_cost += cost
            total_macros['p'] += (row['protein'] * grams) / 100
            total_macros['f'] += (row['fat'] * grams) / 100
            total_macros['c'] += (row['carbs'] * grams) / 100
            total_macros['cal'] += (row['calories'] * grams) / 100

    return {
        "items": selected_items,
        "totals": {k: round(v) for k, v in total_macros.items()},
        "total_cost": round(total_cost, 2),
        "is_ok": total_cost <= budget if budget > 0 else True
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        df = pd.read_csv('2nabiji.csv')
        result = solve_diet_math(
            clean_float(data.get('budget')),
            {'p': clean_float(data.get('protein')), 'f': clean_float(data.get('fat')), 
             'c': clean_float(data.get('carbs')), 'cal': clean_float(data.get('calories'))},
            df
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
