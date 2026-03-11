from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
import json
import random
from openai import OpenAI

# პროექტის ძირითადი საქაღალდე
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

# OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# ფაილის გზა (Excel-ის ვერსია)
EXCEL_PATH = os.path.join(BASE_DIR, '2nabiji.xlsx')

def clean_float(val):
    try: return float(val) if val else 0.0
    except: return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_promos', methods=['GET'])
def get_promos():
    try:
        if not os.path.exists(EXCEL_PATH): return jsonify([])
        # ვიყენებთ read_excel-ს
        df = pd.read_excel(EXCEL_PATH)
        promo_df = df[df['is_promo'] == 1]
        if promo_df.empty: return jsonify([])
        count = min(3, len(promo_df))
        return jsonify(promo_df.sample(n=count).to_dict(orient='records'))
    except Exception as e:
        return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        if not os.path.exists(EXCEL_PATH):
            return jsonify({"error": "მონაცემთა ბაზა ვერ მოიძებნა"}), 404

        df = pd.read_excel(EXCEL_PATH)
        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight', 'total_package_weight']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p, t_c, t_f, t_cal = clean_float(data.get('protein')), clean_float(data.get('carbs')), clean_float(data.get('fat')), clean_float(data.get('calories'))

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        selected_promos = data.get('selectedPromos', [])
        for promo in selected_promos:
            p_weight = clean_float(promo.get('unit_weight')) if promo.get('sale_type') == 'package_pieces' else clean_float(promo.get('total_package_weight'))
            if p_weight == 0: p_weight = 100

            final_items.append({
                "name": f"⭐ {promo['product']}",
                "display": f"პრომო შეთავაზება ({p_weight}გ)",
                "cost": clean_float(promo['price'])
            })

            totals['p'] += (clean_float(promo['protein']) * p_weight) / 100
            totals['f'] += (clean_float(promo['fat']) * p_weight) / 100
            totals['c'] += (clean_float(promo['carbs']) * p_weight) / 100
            totals['cal'] += (clean_float(promo['calories']) * p_weight) / 100
            total_spending += clean_float(promo['price'])

        rem_p, rem_c, rem_f, rem_cal = max(0, t_p - totals['p']), max(0, t_c - totals['c']), max(0, t_f - totals['f']), max(0, t_cal - totals['cal'])
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        
        if not opt_df.empty and (rem_p > 0 or rem_cal > 0):
            costs = (opt_df['price'] / 10).tolist()
            A_ub, b_ub = [], []
            if t_p > 0: A_ub.append((-opt_df['protein']).tolist()); b_ub.append(-rem_p)
            if t_cal > 0:
                A_ub.append((-opt_df['calories']).tolist()); b_ub.append(-rem_cal * 0.95)
                A_ub.append(opt_df['calories'].tolist()); b_ub.append(rem_cal * 1.05)

            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5.0), method='highs')
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 50: continue
                    row = opt_df.iloc[i]
                    u_w, s_type = float(row['unit_weight']), str(row['sale_type']).lower()
                    
                    if 'pieces' in s_type and u_w > 0:
                        count = max(1, round(grams / u_w))
                        f_grams, cost, txt = count * u_w, float(row['price']), f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                    else:
                        f_grams = max(100, grams)
                        cost, txt = (float(row['price']) * f_grams) / 1000, f"აწონე ~{round(f_grams)}გ"

                    final_items.append({"name": row['product'], "display": txt, "cost": round(cost, 2)})
                    totals['p'] += (row['protein'] * f_grams) / 100
                    totals['f'] += (row['fat'] * f_grams) / 100
                    totals['c'] += (row['carbs'] * f_grams) / 100
                    totals['cal'] += (row['calories'] * f_grams) / 100
                    total_spending += cost

        return jsonify({"items": final_items, "total_cost": round(total_spending, 2), "totals": {k: round(v, 1) for k, v in totals.items()}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_recipe', methods=['POST'])
def get_recipe():
    try:
        data = request.get_json()
        basket_items = data.get('items', [])
        basket_totals = data.get('totals', {})

        if not basket_items: 
            return jsonify({"error": "კალათა ცარიელია"}), 400

        # ბაზიდან ყველაზე იაფი პროდუქტების ამოღება AI-სთვის (სარეზერვო რჩევისთვის)
        cheap_suggestions = "პური, ხახვი, კარტოფილი"
        try:
            if os.path.exists(EXCEL_PATH):
                db_df = pd.read_excel(EXCEL_PATH)
                cheap_list = db_df[db_df['is_promo'] == 0].nsmallest(5, 'price')
                cheap_suggestions = ", ".join([f"{r['product']} ({r['price']}₾)" for _, r in cheap_list.iterrows()])
        except: pass

        full_products_info = []
        for item in basket_items:
            name = item['name'].replace('⭐ ', '').strip()
            qty = item.get('display', '')
            full_products_info.append(f"- {name} ({qty})")
        
        products_detailed_str = '\n'.join(full_products_info)

        system_prompt = (
            "შენ ხარ პროფესიონალი ქართველი მზარეული. პასუხობ მხოლოდ გამართული, აკადემიური ქართულით. "
            "ხარ მაქსიმალურად კონკრეტული და ლაკონიური. არ გამოიყენო ზედმეტი შესავალი სიტყვები."
        )

        user_prompt = f"""მოცემული მაქვს პროდუქტების კალათა:
{products_detailed_str}

კალათის ჯამური მაკროები: ცილა {basket_totals.get('p')}გ, კალორია {basket_totals.get('cal')}კკალ.

შენი დავალება:
1. მკაცრად დაიცავი რაოდენობები! თუ კალათაში მითითებულია კონკრეტული რაოდენობა (მაგ: 8 ცალი), რეცეპტში გამოიყენე სრულად.
2. თუ ინგრედიენტები იმდენად ღარიბია, რომ სრულფასოვანი რეცეპტი არ გამოდის:
   - თქვი: 'სამწუხაროდ, მხოლოდ ამ ინგრედიენტით სრულფასოვანი კერძი ვერ მომზადდება.'
   - შესთავაზე ყველაზე იაფი ალტერნატივა ამ სიიდან: {cheap_suggestions}.
3. თუ რეცეპტი გამოდის, დაიცავი სტრუქტურა:
   - 🍳 [კერძის სახელი]
   - 📝 მომზადება: [მაქსიმუმ 3 მოკლე ნაბიჯი]
   - 💡 რჩევა: [როგორ გავხადოთ უფრო გემრიელი მინიმალური დანახარჯით]

არ ილაპარაკო ზედმეტი. დაწერე მხოლოდ რეცეპტი ან რჩევა."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2 # მინიმალური ტემპერატურა მაქსიმალური სიზუსტისთვის
        )

        return jsonify({"recipe": response.choices[0].message.content.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
