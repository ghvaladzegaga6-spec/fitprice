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
    # სვეტების ფორმატირება
    for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    selected_items = []
    total_cost = 0
    current = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
    used_names = set()

    # ოპტიმიზაციის ციკლი (მაქს. 15 პროდუქტი)
    for _ in range(15):
        def_p = max(0, target['p'] - current['p'])
        def_cal = max(0, target['cal'] - current['cal'])
        
        if def_p <= 2 and def_cal <= 20: break
            
        df['score'] = (
            (df['protein'] * (def_p / (target['p'] if target['p'] > 0 else 1))) +
            (df['calories'] / 100 * (def_cal / (target['cal'] if target['cal'] > 0 else 1)))
        ) / (df['price'] + 0.1)
        
        available = df[~df['product'].isin(used_names)]
        if available.empty: break
        
        row = available.sort_values(by='score', ascending=False).iloc[0]
        
        # ლოგიკა: რამდენის გამოყენება გვინდა მაკროებისთვის (მაქს 400გ მრავალფეროვნებისთვის)
        p_needed = (def_p * 100 / row['protein']) if row['protein'] > 0 else 400
        cal_needed = (def_cal * 100 / row['calories']) if row['calories'] > 0 else 400
        grams_to_use = min(p_needed, cal_needed, 400) 
        
        if grams_to_use < 10: break

        if row['pricing_type'] == 'piece':
            # ვყიდულობთ 1 მთლიან შეკვრას
            cost = row['price'] 
            # ვიყენებთ მხოლოდ იმდენს, რამდენიც მაკროებში ჯდება (მაგ. 1კგ-დან 500გ-ს)
            actual_grams = grams_to_use 
            display = f"იყიდე 1 შეკვრა, გამოიყენე {round(actual_grams)}გ"
        else:
            # წონითი პროდუქტი (იყიდე ზუსტად იმდენი, რამდენსაც ჭამ)
            cost = (row['price'] * grams_to_use) / 1000
            actual_grams = grams_to_use
            display = f"აწონე და იყიდე {round(grams_to_use)}გ"

        # ბიუჯეტის შემოწმება
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
        store = data.get('store', '2nabiji')
        csv_path = f"{store}.csv"
        if not os.path.exists(csv_path): csv_path = '2nabiji.csv'

        target = {
            'p': clean_float(data.get('protein')),
            'f': clean_float(data.get('fat')),
            'c': clean_float(data.get('carbs')),
            'cal': clean_float(data.get('calories'))
        }
        budget = clean_float(data.get('budget'))
        
        df = pd.read_csv(csv_path)
        result = solve_diet(budget, target, df)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

