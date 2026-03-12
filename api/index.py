from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
import csv
from openai import OpenAI

# გზების განსაზღვრა
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CURRENT_DIR)
FILE_PATH = os.path.join(BASE_DIR, '2nabiji.xlsx')

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def load_data():
    if not os.path.exists(FILE_PATH):
        return None
    try:
        # სპეციალური პარამეტრები შენი CSV-სთვის: 
        # მძიმე გამყოფი, UTF-8 ენკოდინგი და ბრჭყალების იგნორირება
        df = pd.read_csv(FILE_PATH, 
                         encoding='utf-8', 
                         sep=',', 
                         quotechar='"', 
                         doublequote=True, 
                         on_bad_lines='skip')
        
        df.columns = df.columns.str.strip().str.lower()
        return df
    except Exception as e:
        print(f"Read Error: {e}")
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_categories', methods=['GET'])
def get_categories():
    df = load_data()
    if df is not None and 'category' in df.columns:
        # სუფთა კატეგორიების სია
        categories = sorted([str(c).strip() for c in df['category'].dropna().unique() if str(c).strip()])
        return jsonify(categories)
    return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        df = load_data()
        if df is None: return jsonify({"error": "ფაილი ვერ მოიძებნა"}), 404

        # მონაცემების ტიპების გასწორება (ციფრებად ქცევა)
        for col in ['protein', 'fat', 'carbs', 'calories', 'price', 'is_promo']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # კატეგორიების ფილტრი
        sel_cats = data.get('selectedCategories', [])
        if sel_cats:
            mode = data.get('filterMode', 'include')
            if mode == 'include':
                df = df[df['category'].astype(str).str.strip().isin(sel_cats)]
            else:
                df = df[~df['category'].astype(str).str.strip().isin(sel_cats)]

        target_p = float(data.get('protein', 0))
        target_cal = float(data.get('calories', 0))
        
        # ოპტიმიზაცია - მხოლოდ ის პროდუქტები, სადაც is_promo არის 0
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        
        final_items = []
        total_cost = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        if not opt_df.empty and (target_p > 0 or target_cal > 0):
            costs = (opt_df['price'] / 10).tolist() # ფასი 100გ-ზე
            A_ub, b_ub = [], []
            
            if target_p > 0:
                A_ub.append((-opt_df['protein']).tolist()); b_ub.append(-target_p)
            
            if target_cal > 0:
                # კალორიების დიაპაზონი +/- 5%
                A_ub.append((-opt_df['calories']).tolist()); b_ub.append(-target_cal * 0.95)
                A_ub.append(opt_df['calories'].tolist()); b_ub.append(target_cal * 1.05)

            # Bounds (0, 5) ნიშნავს 0-დან 500 გრამამდე თითო პროდუქტზე
            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')
            
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 45: continue
                    row = opt_df.iloc[i]
                    cost = (row['price'] * grams) / 1000
                    
                    final_items.append({
                        "name": row['product'],
                        "display": f"~{round(grams)}გ",
                        "cost": round(cost, 2)
                    })
                    total_cost += cost
                    totals['p'] += (row['protein'] * grams) / 100
                    totals['cal'] += (row['calories'] * grams) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_cost, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_recipe', methods=['POST'])
def get_recipe():
    try:
        data = request.get_json()
        p_list = ", ".join([i['name'] for i in data.get('items', [])])
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": f"მომიმზადე რეცეპტი ამათგან: {p_list}"}]
        )
        return jsonify({"recipe": response.choices[0].message.content})
    except:
        return jsonify({"error": "AI შეცდომა"})

if __name__ == '__main__':
    app.run(debug=True)
