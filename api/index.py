from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
import json
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

# OpenAI client — Vercel-ზე დამატებული OPENAI_API_KEY env variable-დან წაიკითხავს
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def clean_float(val):
    try: return float(val) if val else 0.0
    except: return 0.0

@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_promos', methods=['GET'])
def get_promos():
    try:
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        if not os.path.exists(csv_path): return jsonify([])
        df = pd.read_csv(csv_path)
        promo_df = df[df['is_promo'] == 1]
        if promo_df.empty: return jsonify([])
        count = min(3, len(promo_df))
        selected_promos = promo_df.sample(n=count).to_dict(orient='records')
        return jsonify(selected_promos)
    except Exception as e:
        print(f"Error fetching promos: {e}")
        return jsonify([])

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        if not os.path.exists(csv_path):
            return jsonify({"error": "მონაცემთა ბაზა ვერ მოიძებნა"}), 404

        df = pd.read_csv(csv_path)
        numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight', 'total_package_weight']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        t_p = clean_float(data.get('protein'))
        t_c = clean_float(data.get('carbs'))
        t_f = clean_float(data.get('fat'))
        t_cal = clean_float(data.get('calories'))

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        # პრომოების გათვალისწინება
        selected_promos = data.get('selectedPromos', [])
        for promo in selected_promos:
            p_weight = clean_float(promo.get('unit_weight')) if promo.get('sale_type') == 'package_pieces' else clean_float(promo.get('total_package_weight'))
            if p_weight == 0: p_weight = 100

            final_items.append({
                "name": f"⭐ {promo['product']}",
                "display": "პრომო შეთავაზება",
                "cost": clean_float(promo['price'])
            })

            totals['p'] += (clean_float(promo['protein']) * p_weight) / 100
            totals['f'] += (clean_float(promo['fat']) * p_weight) / 100
            totals['c'] += (clean_float(promo['carbs']) * p_weight) / 100
            totals['cal'] += (clean_float(promo['calories']) * p_weight) / 100
            total_spending += clean_float(promo['price'])

        # დარჩენილი მაკროები
        rem_p = max(0, t_p - totals['p'])
        rem_c = max(0, t_c - totals['c'])
        rem_f = max(0, t_f - totals['f'])
        rem_cal = max(0, t_cal - totals['cal'])

        # ოპტიმიზაცია ჩვეულებრივი პროდუქტებით
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        if opt_df.empty: return jsonify({"error": "ბაზა ცარიელია"}), 400

        costs = (opt_df['price'] / 10).tolist()
        A_ub, b_ub = [], []
        if t_p > 0: A_ub.append((-opt_df['protein']).tolist()); b_ub.append(-rem_p)
        if t_c > 0: A_ub.append((-opt_df['carbs']).tolist()); b_ub.append(-rem_c)
        if t_f > 0: A_ub.append((-opt_df['fat']).tolist()); b_ub.append(-rem_f)
        if t_cal > 0:
            A_ub.append((-opt_df['calories']).tolist()); b_ub.append(-rem_cal * 0.95)
            A_ub.append(opt_df['calories'].tolist()); b_ub.append(rem_cal * 1.05)

        if A_ub:
            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5.0), method='highs')
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 50: continue
                    row = opt_df.iloc[i]
                    u_w = float(row['unit_weight'])
                    s_type = str(row['sale_type']).strip().lower()

                    if s_type == 'package_pieces' and u_w > 0:
                        count = max(1, round(grams / u_w))
                        f_grams = count * u_w
                        cost = float(row['price'])
                        txt = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                    elif s_type == 'package_weight':
                        f_grams = grams
                        cost = float(row['price'])
                        txt = f"იყიდე 1 შეკვრა (გამოიყენე ~{round(grams)}გ)"
                    else:
                        f_grams = max(100, grams)
                        cost = (float(row['price']) * f_grams) / 1000
                        txt = f"აწონე ~{round(f_grams)}გ"

                    final_items.append({"name": row['product'], "display": txt, "cost": round(cost, 2)})
                    totals['p'] += (row['protein'] * f_grams) / 100
                    totals['f'] += (row['fat'] * f_grams) / 100
                    totals['c'] += (row['carbs'] * f_grams) / 100
                    totals['cal'] += (row['calories'] * f_grams) / 100
                    total_spending += cost
            else:
                return jsonify({"error": "ვარიანტი ვერ მოიძებნა. სცადეთ სხვა ციფრები."}), 400

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/get_recipe', methods=['POST'])
def get_recipe():
    """
    კალათის პროდუქტებზე დაყრდნობით ChatGPT-ით რეცეპტის გენერაცია.
    თუ პროდუქტები ძალიან ცოტაა, AI შემოთავაზებს მონაცემთა ბაზიდან
    ყველაზე იაფ დამატებით ინგრედიენტებს მაკრო-ანალიზით.
    """
    try:
        data = request.get_json()
        basket_items = data.get('items', [])       # [{"name": "...", "display": "...", "cost": ...}]
        basket_totals = data.get('totals', {})     # {"p": ..., "f": ..., "c": ..., "cal": ...}

        if not basket_items:
            return jsonify({"error": "კალათა ცარიელია"}), 400

        # მხოლოდ პროდუქტის სახელები (⭐ პრეფიქსის გარეშე)
        product_names = [item['name'].replace('⭐ ', '').strip() for item in basket_items]
        products_str = ', '.join(product_names)

        # მონაცემთა ბაზის ჩატვირთვა (AI-ისთვის საჭიროების შემთხვევაში)
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        db_products_str = ""
        db_products_list = []
        if os.path.exists(csv_path):
            db_df = pd.read_csv(csv_path)
            numeric_cols = ['protein', 'fat', 'carbs', 'calories', 'price']
            for col in numeric_cols:
                if col in db_df.columns:
                    db_df[col] = pd.to_numeric(db_df[col], errors='coerce').fillna(0.0)
            # ყველაზე იაფი 30 პროდუქტი (is_promo=0)
            cheap_df = db_df[db_df['is_promo'] == 0].nsmallest(30, 'price')
            db_products_list = cheap_df[['product', 'price', 'protein', 'fat', 'carbs', 'calories']].to_dict(orient='records')
            db_products_str = json.dumps(db_products_list, ensure_ascii=False)

        # ChatGPT prompt
        system_prompt = (
            "შენ ხარ ქართული კვების ასისტენტი. "
            "პასუხი ყოველთვის მოკლე და ქართულ ენაზე. "
            "მაქსიმუმ 200 სიტყვა."
        )

        user_prompt = f"""კალათაში არსებული პროდუქტები: {products_str}

კალათის მაკრო ჯამი: ცილა {basket_totals.get('p', 0)}გ, ცხიმი {basket_totals.get('f', 0)}გ, ნახშირწყალი {basket_totals.get('c', 0)}გ, კალორია {basket_totals.get('cal', 0)}კკალ.

შენი ამოცანა:
1. თუ ამ პროდუქტებით რეცეპტის მომზადება შესაძლებელია — დაწერე მოკლე, კონკრეტული რეცეპტი (მხოლოდ კალათის პროდუქტებზე დაყრდნობით).
2. თუ პროდუქტები არ არის საკმარისი რეცეპტისთვის — მონაცემთა ბაზიდან შემოთავაზე ყველაზე იაფი საჭირო ინგრედიენტები:
   ხელმისაწვდომი პროდუქტები ბაზაში (JSON): {db_products_str}
   
   შემოთავაზებული ინგრედიენტებისთვის დათვალე:
   - დამატებითი ღირებულება (ლარი)
   - დამატებითი მაკრო: ცილა, ცხიმი, ნახშირწყალი, კალორია

პასუხი სტრუქტურა (მოკლედ):
- 🍳 რეცეპტი: [სახელი]
- მომზადება: [2-4 ნაბიჯი]
- 💰 დამატებითი ხარჯი: X ₾ (მხოლოდ თუ ახალი ინგრედიენტები სჭირდება)
- 📊 დამატებითი მაკრო: ც:Xგ / ც:Xგ / ნ:Xგ / Xკკალ (მხოლოდ თუ ახალი ინგრედიენტები სჭირდება)"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=500,
            temperature=0.7
        )

        recipe_text = response.choices[0].message.content.strip()

        return jsonify({"recipe": recipe_text})

    except Exception as e:
        print(f"Recipe error: {e}")
        return jsonify({"error": f"AI სერვისი მიუწვდომელია: {str(e)}"}), 500


if __name__ == '__main__':
    app.run(debug=True)
