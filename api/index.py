from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os

app = Flask(__name__, template_folder='../templates')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        df = pd.read_csv('2nabiji.csv')
        
        # სამიზნე მაკროები მომხმარებლისგან
        target = {
            'p': float(data.get('protein', 0)),
            'f': float(data.get('fat', 0)),
            'c': float(data.get('carbs', 0)),
            'cal': float(data.get('calories', 0))
        }

        # 1. მიზანი: მინიმალური ფასი
        obj = []
        for _, row in df.iterrows():
            # ფასი 100 გრამზე
            p = row['price'] if row['pricing_type'] == 'piece' else row['price'] / 10
            obj.append(p)

        # 2. შეზღუდვები (Constraints)
        lhs_ineq = []
        rhs_ineq = []

        # ცილა, ცხიმი, ნახშირწყალი (მინიმუმ სამიზნე რაოდენობა)
        lhs_ineq.append([-x for x in df['protein'].values])
        rhs_ineq.append(-target['p'])
        lhs_ineq.append([-x for x in df['fat'].values])
        rhs_ineq.append(-target['f'])
        lhs_ineq.append([-x for x in df['carbs'].values])
        rhs_ineq.append(-target['c'])

        # 3. ამოხსნა (LP Optimization)
        res = linprog(c=obj, A_ub=lhs_ineq, b_ub=rhs_ineq, bounds=(0, 5), method='highs')

        if not res.success:
            return jsonify({"error": "შეუძლებელია ამ მაკროების შევსება არსებული პროდუქტებით."})

        final_items = []
        total_cost = 0
        for i, amount in enumerate(res.x):
            if amount > 0.1:
                row = df.iloc[i]
                cost = amount * (row['price'] if row['pricing_type'] == 'piece' else row['price']/10)
                final_items.append({
                    "name": row['product'],
                    "display": f"იყიდე ~{round(amount*100)}გ",
                    "cost": round(cost, 2)
                })
                total_cost += cost

        return jsonify({
            "items": final_items,
            "total_cost": round(total_cost, 2),
            "totals": target # გამარტივებისთვის
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400
