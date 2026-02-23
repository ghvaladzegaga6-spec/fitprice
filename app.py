from flask import Flask, render_template, request, jsonify
import pandas as pd
import math

app = Flask(__name__)

# დამხმარე ფუნქცია რიცხვების უსაფრთხო გარდაქმნისთვის
def clean_float(val):
    try:
        if val is None or str(val).strip() == "":
            return 0.0
        return float(val)
    except:
        return 0.0

def solve_diet(budget, target, df):
    # მონაცემების გასუფთავება
    for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    selected_items = []
    total_cost = 0
    current = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
    
    attempts = 0
    # პროდუქტების სია, რომლებიც უკვე ავირჩიეთ (რომ არ განმეორდეს)
    used_names = set()

    # სანამ კალორიების ან ცილის 95%-ს არ მივაღწევთ
    while attempts < 15: 
        def_p = max(0, target['p'] - current['p'])
        def_cal = max(0, target['cal'] - current['cal'])
        
        if (def_p <= 2 and def_cal <= 20) or attempts > 10:
            break
            
        # ფორმულა: ეძებს პროდუქტს, რომელიც საუკეთესოდ ავსებს დეფიციტს ბიუჯეტურ ფასად
        df['score'] = (
            (df['protein'] * (def_p / (target['p'] if target['p'] > 0 else 1))) +
            (df['calories'] / 100 * (def_cal / (target['cal'] if target['cal'] > 0 else 1)))
        ) / (df['price'] + 0.1)
        
        # ვირჩევთ საუკეთესოს, რომელიც ჯერ არ გამოგვიყენებია
        available_df = df[~df['product'].isin(used_names)]
        if available_df.empty: break
        
        row = available_df.sort_values(by='score', ascending=False).iloc[0]
        
        # რაოდენობის დათვლა
        p_needed = (def_p * 100 / row['protein']) if row['protein'] > 0 else 500
        cal_needed = (def_cal * 100 / row['calories']) if row['calories'] > 0 else 500
        
        grams = min(p_needed, cal_needed, 400) # მაქსიმუმ 400გ ერთ პროდუქტზე
        if grams < 10: break

        if row['pricing_type'] == 'piece':
            units = math.ceil(grams / 100) # დავუშვათ 1 ცალი საშუალოდ 100გ-ია
            cost = units * row['price']
            actual_grams = units * 100
            display = f"იყიდე {units} ცალი/შეკვრა"
        else:
            cost = (row['price'] * grams) / 1000
            actual_grams = grams
            display = f"აწონე {round(grams)}გ"

        # ბიუჯეტის შემოწმება
        if budget > 0 and (total_cost + cost) > budget:
            attempts += 1
            # ვნიშნავთ როგორც გამოყენებულს, რომ შემდეგზე სხვა სცადოს
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
        attempts += 1

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
        
        # სცადე ორივე ფაილიდან წაკითხვა
        try:
            df = pd.read_csv('2nabiji.csv')
        except:
            df = pd.read_csv('nikora.csv')
            
        result = solve_diet(budget, target, df)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True)
