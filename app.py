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
    # მონაცემების ტიპების გარდაქმნა
    for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    selected_items = []
    total_cost = 0
    curr = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
    used_names = set()

    # ვცდილობთ 10-12 ნაბიჯში შევავსოთ ყველაფერი
    for _ in range(12):
        # 1. რამდენად გვაკლია თითოეული მაკრო (0-დან 1-მდე კოეფიციენტი)
        p_def = max(0, (target['p'] - curr['p']) / target['p']) if target['p'] > 0 else 0
        f_def = max(0, (target['f'] - curr['f']) / target['f']) if target['f'] > 0 else 0
        c_def = max(0, (target['c'] - curr['c']) / target['c']) if target['c'] > 0 else 0
        cal_def = max(0, (target['cal'] - curr['cal']) / target['cal']) if target['cal'] > 0 else 0

        # თუ ყველა მაკრო თითქმის შევსებულია, ვჩერდებით
        if p_def < 0.05 and c_def < 0.05 and cal_def < 0.05:
            break

        available = df[~df['product'].isin(used_names)].copy()
        if available.empty: break

        # 2. ქულების მინიჭება (Utility Function)
        # პროდუქტი მით უფრო ძვირფასია, რაც უფრო მეტად შეიცავს იმას, რაც ყველაზე მეტად გვაკლია
        def score_product(row):
            # რამდენად სასარგებლოა ეს პროდუქტი არსებული დეფიციტისთვის
            benefit = (
                (row['protein'] * p_def * 10) +  # ცილას მეტი წონა აქვს
                (row['fat'] * f_def * 2) +
                (row['carbs'] * c_def * 5) +
                (row['calories'] / 20 * cal_def)
            )
            # ეფექტურობა = სარგებელი / ფასი
            return benefit / (row['price'] + 1)

        available['score'] = available.apply(score_product, axis=1)
        row = available.sort_values(by='score', ascending=False).iloc[0]

        # 3. რაოდენობის განსაზღვრა (მრავალფეროვნების გამო ლიმიტი 300გ)
        # ვნახულობთ რამდენი გრამია საჭირო, რომ რომელიმე მაკრო შეივსოს
        needed_p = (target['p'] - curr['p']) * 100 / row['protein'] if row['protein'] > 0 else 300
        needed_c = (target['c'] - curr['c']) * 100 / row['carbs'] if row['carbs'] > 0 else 300
        grams_to_use = min(needed_p, needed_c, 300) # მაქსიმუმ 300გ ერთ პროდუქტზე

        if grams_to_use < 20: 
            used_names.add(row['product'])
            continue

        # 4. ფასის და მაკროების დათვლა
        if row['pricing_type'] == 'piece':
            cost = row['price']
            actual_grams = grams_to_use
            display = f"იყიდე 1 შეკვრა, გამოიყენე {round(actual_grams)}გ"
        else:
            cost = (row['price'] * grams_to_use) / 1000
            actual_grams = grams_to_use
            display = f"აწონე და იყიდე {round(grams_to_use)}გ"

        # ბიუჯეტის კონტროლი
        if budget > 0 and (total_cost + cost) > budget:
            used_names.add(row['product'])
            continue

        # დამატება
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
# ... (Flask-ის დანარჩენი ნაწილი უცვლელია)
