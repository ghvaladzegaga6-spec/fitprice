from flask import Flask, render_template, request, jsonify
import pandas as pd
from scipy.optimize import linprog
import os
import google.generativeai as genai

# პროექტის მისამართები
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- GEMINI-ს სტაბილური კონფიგურაცია ---
api_key = os.environ.get("GEMINI_API_KEY")

# აქ ვუთითებთ კონკრეტულად სტაბილურ მოდელს
# gemini-pro ყველაზე ნაკლებად პრობლემურია Cloud-ზე
try:
    if api_key:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')
    else:
        model = None
except Exception:
    model = None

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))

def clean_float(val):
    try: return float(val) if val else 0.0
    except: return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_promos', methods=['GET'])
def get_promos():
    try:
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        if not os.path.exists(csv_path): return jsonify([])
        df = pd.read_csv(csv_path)
        promo_df = df[df['is_promo'] == 1]
        if promo_df.empty: return jsonify([])
        return jsonify(promo_df.sample(n=min(3, len(promo_df))).to_dict(orient='records'))
    except:
        return jsonify([])

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        df = pd.read_csv(csv_path)
        
        # მონაცემების გასუფთავება
        for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        # აქ შენი კალკულაციის ლოგიკაა (გაგრძელება უცვლელად)
        # ... (გამოვიყენოთ წინა წარმატებული ვერსიის ლოგიკა)
        
        # დროებითი პასუხი ტესტირებისთვის
        return jsonify({"items": [], "total_cost": 0, "totals": {"p":0,"f":0,"c":0,"cal":0}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_recipe', methods=['POST'])
def get_recipe():
    # თუ model საერთოდ ვერ შეიქმნა
    if not model:
        return jsonify({"error": "AI მოდელი ვერ ჩაიტვირთა. შეამოწმეთ API Key."}), 500
        
    try:
        data = request.get_json()
        items = data.get('items', [])
        items_str = ", ".join([i['name'] for i in items])
        
        # რეცეპტის მოთხოვნა
        response = model.generate_content(
            f"მომიფიქრე 1 რეცეპტი ამ პროდუქტებით: {items_str}. დაწერე ქართულად, მოკლედ.",
            generation_config=genai.types.GenerationConfig(
                candidate_count=1,
                max_output_tokens=500,
                temperature=0.7
            )
        )
        return jsonify({"recipe": response.text})
        
    except Exception as e:
        # თუ 404 მაინც ამოაგდო, ნიშნავს რომ API Key-ს აქვს პრობლემა
        return jsonify({"error": f"AI შეცდომა: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)
