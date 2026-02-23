from flask import Flask, render_template, request, jsonify
import pandas as pd
import math
import os

app = Flask(__name__)

def clean_float(val):
    try:
        return float(val) if val and str(val).strip() != "" else 0.0
    except:
        return 0.0

def solve_diet(budget, target, df):
    # სვეტების გასუფთავება
    for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    selected_items = []
    total_cost = 0
    current = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
    used_names = set()

    # ოპტიმიზაციის ციკლი
    for _ in range(15):
        def_p = max(0, target['p'] - current['p'])
        def_cal = max(0, target['cal'] - current['cal'])
        
        if def_p <= 1 and def_cal <= 10:
            break
            
        # ეფექტურობის სკორი
        df['score'] = (
            (df['protein'] * (def_p / (target['p'] if target['p'] > 0 else 1))) +
            (df['calories'] / 100 * (def_cal / (target['cal'] if target['cal'] > 0 else 1)))
        ) / (df['price'] + 0.1)
        
        available = df[~df['product'].isin(used_names)]
        if available.empty: break
        
        row = available.sort_values(by='score', ascending=False).iloc[0]
        
        # რაოდენობის განსაზღვრა (მაქსიმუმ 400გ ერთ პროდუქტზე მრავალფეროვნებისთვის)
        p_needed = (def_p * 100 / row['protein']) if row['protein'] > 0 else 400
        cal_needed = (def_cal * 100 / row['calories']) if row['calories'] > 0 else 400
        grams = min(p_needed, cal_needed, 400)
        
        if grams < 10: break

        if row['pricing_type'] == 'piece':
            units = math.ceil(grams / 100) # პირობითად 1 ცალი 100გ
            cost = units * row['price']
            actual_grams = units * 100
            display = f"იყიდე {units} ცალი"
        else:
            cost = (row['price'] * grams) / 1000
            actual_grams = grams
            display = f"აწონე {round(grams)}გ"

        if budget > 0 and (total_cost + cost) > budget:
            used_names.add(row['product'])
            continue

        selected_items.append({
            'name': row['product'],
            'display': display,
            'cost': round(cost, 2)
        })
        
        used_names.add(row['product'])
        total_cost += cost
        current['p'] += (row['protein'] * actual_grams) / 100
        current['f'] += (row['fat'] * actual_grams) / 100
        current['c'] += (row['carbs'] * actual_grams) / 100
        current['cal'] += (row['calories'] * actual_grams) / 100

    return {
        'items': selected_items,
        'totals': {k: round(v, 1) for k, v in current.items()},
        'total_cost': round(total_cost, 2),
        'is_ok': total_cost <= budget if budget > 0 else True
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        budget = clean_float(data.get('budget'))
        target = {
            'p': clean_float(data.get('protein')),
            'f': clean_float(data.get('fat')),
            'c': clean_float(data.get('carbs')),
            'cal': clean_float(data.get('calories'))
        }
        
        # ფაილის წაკითხვის მცდელობა
        csv_path = '2nabiji.csv' if os.path.exists('2nabiji.csv') else 'nikora.csv'
        df = pd.read_csv(csv_path)
        
        result = solve_diet(budget, target, df)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400
