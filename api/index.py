from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import numpy as np
import os

# ... (წინა იმპორტები და კონფიგურაცია)

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        df = pd.read_csv(csv_path)

        cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))

        # ფილტრაცია სექციით
        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()

        # მიზანი: მინიმალური ფასი + მინიმალური გადაცდომა ნახშირწყლებში
        # ამისთვის ვიყენებთ კოეფიციენტებს, რომ პროგრამამ ზედმეტი ნახშირწყალი არ აიღოს
        price_coeff = (df['price'] / 1000).values
        carb_penalty = (df['carbs'] / 100).values * 0.5 # "ჯარიმა" ზედმეტ ნახშირწყალზე
        obj = price_coeff + carb_penalty

        A_ub = []
        b_ub = []

        # 1. მინიმალური მოთხოვნის დაცვა (>= target)
        if t_p > 0: A_ub.append((-df['protein']).tolist()); b_ub.append(-t_p)
        if t_c > 0: A_ub.append((-df['carbs']).tolist()); b_ub.append(-t_c)
        if t_f > 0: A_ub.append((-df['fat']).tolist()); b_ub.append(-t_f)

        # 2. მაქსიმალური ზღვარი (რომ 78-ის ნაცვლად 152 არ მოგვცეს)
        # ვუწესებთ მაქსიმუმ 20%-იან გადახრას ზემოთ
        if t_p > 0: A_ub.append(df['protein'].tolist()); b_ub.append(t_p * 1.2)
        if t_c > 0: A_ub.append(df['carbs'].tolist()); b_ub.append(t_c * 1.2)
        if t_f > 0: A_ub.append(df['fat'].tolist()); b_ub.append(t_f * 1.2)

        # Bounds: [0, 3.0] (300გ ლიმიტი)
        res = linprog(c=obj, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        # თუ მკაცრი 20%-ით ვერ იპოვა, ვუშვებთ 40%-ს
        if not res.success:
            b_ub = []
            if t_p > 0: A_ub.append((-df['protein']).tolist()); b_ub.append(-t_p)
            if t_c > 0: A_ub.append((-df['carbs']).tolist()); b_ub.append(-t_c)
            if t_f > 0: A_ub.append((-df['fat']).tolist()); b_ub.append(-t_f)
            # Relaxation
            if t_p > 0: A_ub.append(df['protein'].tolist()); b_ub.append(t_p * 1.4)
            if t_c > 0: A_ub.append(df['carbs'].tolist()); b_ub.append(t_c * 1.4)
            if t_f > 0: A_ub.append(df['fat'].tolist()); b_ub.append(t_f * 1.4)
            res = linprog(c=obj, A_ub=A_ub, b_ub=b_ub, bounds=(0, 3.0), method='highs')

        if not res.success:
            return jsonify({"error": "შეუძლებელია ამ მაკროების დასმა 150-300გ დიაპაზონში. სცადეთ დიაპაზონის გაზრდა ან სხვა პროდუქტები."})

        final_items = []
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
        total_spending = 0

        for i, x in enumerate(res.x):
            grams = x * 100
            if grams < 10: continue
            
            row = df.iloc[i]
            if grams < 150: grams = 150 # მინიმუმ 150გ
            
            unit_w = float(row['unit_weight'])
            is_piece = row['pricing_type'] == 'piece'

            if is_piece and unit_w > 0:
                count = round(grams / unit_w)
                if count == 0: count = 1
                if (count * unit_w) > 300: count = int(300 / unit_w)
                final_grams = count * unit_w
                item_cost = float(row['price'])
                instr = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
            else:
                final_grams = grams
                item_cost = (float(row['price']) * grams) / 1000
                instr = f"აწონე ~{round(grams)}გ"

            final_items.append({
                "name": str(row['product']),
                "display": instr,
                "cost": round(item_cost, 2)
            })

            total_spending += item_cost
            totals['p'] += (row['protein'] * final_grams) / 100
            totals['f'] += (row['fat'] * final_grams) / 100
            totals['c'] += (row['carbs'] * final_grams) / 100
            totals['cal'] += (row['calories'] * final_grams) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
