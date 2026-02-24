from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os

# განვსაზღვროთ საქაღალდეების გზები დინამიურად
# Vercel-ზე api/index.py-დან ერთი საფეხურით მაღლა უნდა ავიდეთ ფაილების საპოვნელად
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')

app = Flask(__name__, template_folder=TEMPLATE_DIR)

def clean_float(val):
    try:
        if val is None or str(val).strip() == "":
            return 0.0
        return float(val)
    except:
        return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        
        # CSV ფაილის გზის სწორად განსაზღვრა
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        
        if not os.path.exists(csv_path):
            return jsonify({"error": f"მონაცემთა ბაზა ვერ მოიძებნა მისამართზე: {csv_path}"}), 404
            
        df = pd.read_csv(csv_path)
        
        # კატეგორიის ფილტრი
        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category]
            if df.empty:
                return jsonify({"error": f"სექციაში '{category}' პროდუქტები ვერ მოიძებნა."})

        # მონაცემების ტიპების გარდაქმნა და NaN-ების გასუფთავება
        for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        # მომხმარებლის მონაცემები
        target_cal = clean_float(data.get('calories'))
        target_p = clean_float(data.get('protein'))
        target_f = clean_float(data.get('fat'))
        target_c = clean_float(data.get('carbs'))

        # მათემატიკური მატრიცის მომზადება (მიზანი: მინიმალური ფასი 100გ-ზე)
        obj = (df['price'] / 10).tolist() 
        
        if target_cal > 0:
            A_eq = [df['calories'].tolist()]
            b_eq = [target_cal]
        else:
            A_eq = [
                df['protein'].tolist(),
                df['fat'].tolist(),
                df['carbs'].tolist()
            ]
            b_eq = [target_p, target_f, target_c]

        # ამოხსნა (0-დან 500გ-მდე თითო პროდუქტზე)
        res = linprog(c=obj, A_eq=A_eq, b_eq=b_eq, bounds=(0, 5), method='highs')

        if not res.success:
            return jsonify({"error": "ვერ მოიძებნა ბიუჯეტური ვერსია. სცადეთ პარამეტრების შეცვლა."})

        final_items = []
        total_spending = 0
        totals = {'p': 0.0, 'f': 0.0, 'c': 0.0, 'cal': 0.0}

        for i, x in enumerate(res.x):
            if x > 0.05: # მინიმუმ 5გ
                row = df.iloc[i]
                grams_to_eat = x * 100
                
                if row['pricing_type'] == 'piece':
                    cost = float(row['price'])
                    instr = f"იყიდე 1 შეკვრა (გამოიყენე {round(grams_to_eat)}გ)"
                else:
                    cost = (float(row['price']) * grams_to_eat) / 1000
                    instr = f"აწონე {round(grams_to_eat)}გ"

                final_items.append({
                    "name": str(row['product']), 
                    "display": instr, 
                    "cost": round(cost, 2)
                })
                
                total_spending += cost
                totals['p'] += (row['protein'] * grams_to_eat) / 100
                totals['f'] += (row['fat'] * grams_to_eat) / 100
                totals['c'] += (row['carbs'] * grams_to_eat) / 100
                totals['cal'] += (row['calories'] * grams_to_eat) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })

    except Exception as e:
        return jsonify({"error": f"სერვერის შეცდომა: {str(e)}"}), 500

# Vercel-ისთვის საჭირო არ არის, მაგრამ ლოკალურად გამოსაყენებლად:
if __name__ == '__main__':
    app.run(debug=True)
