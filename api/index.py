from flask import Flask, render_template, request, jsonify, send_from_directory
import pandas as pd
from scipy.optimize import linprog
import os

# განვსაზღვროთ მთავარი საქაღალდე (Root), სადაც static და templates-ია
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

# favicon-ის მოთხოვნაზე პასუხი, რომ ბრაუზერმა ძებნით არ დატვირთოს საიტი
@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        # CSV ფაილი უნდა იყოს პროექტის მთავარ საქაღალდეში (Root)
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        
        if not os.path.exists(csv_path):
            return jsonify({"error": "მონაცემთა ბაზა (CSV) ვერ მოიძებნა"}), 404

        df = pd.read_csv(csv_path)
        
        # სვეტების გასუფთავება
        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))
        t_cal = clean_float(data.get('calories'))

        costs = (df['price'] / 10).tolist() 

        A_ub, b_ub = [], []
        if t_p > 0: A_ub.append((-df['protein']).tolist()); b_ub.append(-t_p)
        if t_c > 0: A_ub.append((-df['carbs']).tolist()); b_ub.append(-t_c)
        if t_f > 0: A_ub.append((-df['fat']).tolist()); b_ub.append(-t_f)
        if t_cal > 0:
            A_ub.append((-df['calories']).tolist()); b_ub.append(-t_cal * 0.95)
            A_ub.append(df['calories'].tolist()); b_ub.append(t_cal * 1.05)

        if not A_ub:
            return jsonify({"error": "შეავსეთ მონაცემები"}), 400

        res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5.0), method='highs')

        if not res.success:
            return jsonify({"error": "ვარიანტი ვერ მოიძებნა. სცადეთ სხვა ციფრები."}), 400

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            grams = x * 100
            if grams < 50: continue 
            
            row = df.iloc[i]
            s_type = str(row['sale_type']).strip().lower() if 'sale_type' in row else 'weight'
            u_w = float(row.get('unit_weight', 0))
            
            display_text = ""
            final_grams_to_use = grams
            item_cost = 0

            if s_type == 'package_pieces' and u_w > 0:
                count = max(1, round(grams / u_w))
                final_grams_to_use = count * u_w
                item_cost = float(row['price'])
                display_text = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
            elif s_type == 'package_weight':
                final_grams_to_use = grams
                item_cost = float(row['price'])
                display_text = f"იყიდე 1 შეკვრა (გამოიყენე ~{round(grams)}გ)"
            else:
                final_grams_to_use = max(100, grams)
                item_cost = (float(row['price']) * final_grams_to_use) / 1000
                display_text = f"აწონე ~{round(final_grams_to_use)}გ"

            final_items.append({
                "name": row['product'],
                "display": display_text,
                "cost": round(item_cost, 2)
            })

            totals['p'] += (row['protein'] * final_grams_to_use) / 100
            totals['f'] += (row['fat'] * final_grams_to_use) / 100
            totals['c'] += (row['carbs'] * final_grams_to_use) / 100
            totals['cal'] += (row['calories'] * final_grams_to_use) / 100
            total_spending += item_cost

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def clean_float(val):
    try:
        return float(val) if val else 0.0
    except:
        return 0.0
