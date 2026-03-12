from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
from openai import OpenAI

# გზების განსაზღვრა
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CURRENT_DIR)
# ფაილის სახელი (Vercel-ზე და ლოკალურად)
FILE_PATH = os.path.join(BASE_DIR, '2nabiji.xlsx')

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def load_data():
    if not os.path.exists(FILE_PATH):
        return None
    try:
        # ვკითხულობთ როგორც CSV (რადგან ფაილი რეალურად CSV-ა)
        # encoding='utf-8' კრიტიკულია ქართული ასოებისთვის
        df = pd.read_csv(FILE_PATH, encoding='utf-8', sep=',')
        
        # ვასუფთავებთ სვეტების სახელებს
        df.columns = df.columns.str.strip().str.lower()
        return df
    except Exception as e:
        try:
            # თუ UTF-8-მა არ იმუშავა, ვცადოთ excel-ის ფორმატი
            df = pd.read_excel(FILE_PATH)
            df.columns = df.columns.str.strip().str.lower()
            return df
        except:
            print(f"Error loading file: {e}")
            return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_categories', methods=['GET'])
def get_categories():
    df = load_data()
    if df is not None and 'category' in df.columns:
        # ვიღებთ უნიკალურ კატეგორიებს და ვაშორებთ ცარიელებს
        categories = df['category'].dropna().unique().tolist()
        return jsonify([str(c).strip() for c in categories if str(c).strip()])
    return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        df = load_data()
        if df is None:
            return jsonify({"error": "მონაცემთა ბაზა ვერ მოიძებნა"}), 404

        # რიცხვითი მონაცემების ფორმატირება
        cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'is_promo']
        for col in cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # ფილტრაცია კატეგორიებით
        sel_cats = data.get('selectedCategories', [])
        if sel_cats:
            mode = data.get('filterMode', 'include')
            if mode == 'include':
                df = df[df['category'].astype(str).str.strip().isin(sel_cats)]
            else:
                df = df[~df['category'].astype(str).str.strip().isin(sel_cats)]

        t_p = float(data.get('protein', 0))
        t_cal = float(data.get('calories', 0))
        
        # ოპტიმიზაცია (მხოლოდ არა-პრომო პროდუქტებზე)
        opt_df = df[df['is_promo'] == 0].reset_index(drop=True)
        items, total_cost = [], 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        if not opt_df.empty and (t_p > 0 or t_cal > 0):
            costs = (opt_df['price'] / 10).tolist()
            A_ub, b_ub = [], []
            
            if t_p > 0:
                A_ub.append((-opt_df['protein']).tolist()); b_ub.append(-t_p)
            if t_cal > 0:
                A_ub.append((-opt_df['calories']).tolist()); b_ub.append(-t_cal * 0.95)
                A_ub.append(opt_df['calories'].tolist()); b_ub.append(t_cal * 1.05)

            res = linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')
            
            if res.success:
                for i, x in enumerate(res.x):
                    grams = x * 100
                    if grams < 40: continue
                    row = opt_df.iloc[i]
                    cost = (row['price'] * grams) / 1000
                    items.append({
                        "name": row['product'],
                        "display": f"~{round(grams)}გ",
                        "cost": round(cost, 2)
                    })
                    total_cost += cost
                    totals['p'] += (row['protein'] * grams) / 100
                    totals['cal'] += (row['calories'] * grams) / 100

        return jsonify({"items": items, "total_cost": round(total_cost, 2), "totals": totals})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
