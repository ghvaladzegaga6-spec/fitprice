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
    # სვეტების გაწმენდა
    for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    selected_items = []
    total_cost = 0
    # მიმდინარე მაკროები
    curr = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
    used_names = set()

    # მაქსიმუმ 12 ნაბიჯი მრავალფეროვნებისთვის
    for _ in range(12):
        # 1. გამოვთვალოთ დეფიციტი თითოეული მაკროსთვის
        diff = {
            'p': max(0, target['p'] - curr['p']),
            'f': max(0, target['f'] - curr['f']),
            'c': max(0, target['c'] - curr['c']),
            'cal': max(0, target['cal'] - curr['cal'])
        }

        # თუ ყველა მთავარი მაკრო (ცილა და კალორია) 90%-ით შევსებულია, ვჩერდებით
        if diff['p'] < 5 and diff['cal'] < 50:
            break

        available = df[~df['product'].isin(used_names)].copy()
        if available.empty: break

        # 2. ქულების მინიჭება დეფიციტის მიხედვით
        # პროდუქტი მით უფრო "კარგია", რაც უფრო მეტად ფარავს იმას, რაც გვაკლია
        def calculate_utility(row):
            # რამდენად სასარგებლოა ეს პროდუქტი ჩვენი დეფიციტისთვის
            utility = (
                (row['protein'] * diff['p'] / (target['p'] if target['p'] > 0 else 1)) +
                (row['fat'] * diff['f'] / (target['f'] if target['f'] > 0 else 1)) +
                (row['carbs'] * diff['c'] / (target['c'] if target['c'] > 0 else 1)) +
                (row['calories'] / 20 * diff['cal'] / (target['cal'] if target['cal'] > 0 else 1))
            )
            # საბოლოო ქულა = სარგებელი გაყოფილი ფასზე (ეფექტურობა)
            return utility / (row['price'] + 0.1)

        available['score'] = available.apply(calculate_utility, axis=1)
        row = available.sort_values(by='score', ascending=False).iloc[0]

        # 3. რაოდენობის განსაზღვრა (მოხმარება)
        # ვსაზღვრავთ რამდენია საჭირო დეფიციტის შესავსებად, მაგრამ მაქსიმუმ 350გ
        needed_by_p = (diff['p'] * 100 / row['protein']) if row['protein'] > 0 else 350
        needed_by_cal = (diff['cal'] * 100 / row['calories']) if row['calories'] > 0 else 350
        grams_to_use = min(needed_by_p, needed_by_cal, 350)

        if grams_to_use < 15: 
            used_names.add(row['product'])
            continue

        # 4. ყიდვის ლოგიკა (შენი მოთხოვნის მიხედვით)
        if row['pricing_type'] == 'piece':
            cost = row['price'] # ვიხდით მთლიანი შეკვრის ფასს
            actual_grams = grams_to_use # ვჭამთ მხოლოდ ნაწილს
            display = f"იყიდე 1 შეკვრა, გამოიყენე {round(actual_grams)}გ"
        else:
            cost = (row['price'] * grams_to_use) / 1000
            actual_grams = grams_to_use
            display = f"აწონე და იყიდე {round(grams_to_use)}გ"

        # 5. ბიუჯეტის ლიმიტი
        if budget > 0 and (total_cost + cost) > budget:
            used_names.add(row['product'])
            continue

        # წარმატებული დამატება
        selected_items.append({
            'name': row['product'],
            'display': display,
            'cost': round(cost, 2)
        })
        used_names.add(row['product'])
        total_cost += cost
        curr['p'] += (row['protein'] * actual_grams) / 100
        curr['f'] += (row['fat'] * actual_grams) / 100
        curr['c'] += (row['carbs'] * actual_grams) / 100
        curr['cal'] += (row['calories'] * actual_grams) / 100

    return {
        'items': selected_items,
        'totals': {k: round(v, 1) for k, v in curr.items()},
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
