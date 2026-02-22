from flask import Flask, render_template, request, jsonify
import pandas as pd
import math

app = Flask(__name__)

def solve_diet(budget, target_macros, df):
    # ეფექტურობის გამოთვლა (ცილა 1 ლარზე)
    df['efficiency'] = df['protein'] / df['price']
    df = df.sort_values(by='efficiency', ascending=False)

    selected_items = []
    total_cost = 0
    consumed = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

    for _, row in df.iterrows():
        if consumed['p'] >= target_macros['p']:
            break

        needed_p = target_macros['p'] - consumed['p']
        
        if row['pricing_type'] == 'piece':
            # ვიანგარიშებთ რამდენი შეკვრაა საჭირო სრული ცილისთვის
            # row['protein'] არის ცილა 100 გრამში, უნდა ვიცოდეთ შეკვრის წონაც
            # რადგან ბაზაში მხოლოდ 100გ-ზეა მონაცემები, დავუშვათ საშუალო შეკვრა 500გ-ია
            # ან უბრალოდ გამოვიყენოთ გრამების ლოგიკა მეტი სიზუსტისთვის:
            
            needed_grams = (needed_p * 100) / row['protein']
            num_packs = math.ceil(needed_grams / 500) # ვთვლით რამდენი 500გ-იანი შეკვრა გვინდა
            
            actual_price = row['price'] * num_packs
            display_amount = f"იყიდე {num_packs} შეკვრა (~{round(needed_grams)}გ)"
            
            used_grams = needed_grams 
        else:
            # აწონადი პროდუქტისთვის
            needed_grams = (needed_p * 100) / row['protein']
            actual_price = (row['price'] * needed_grams) / 1000
            display_amount = f"აწონე {round(needed_grams)}გ"
            used_grams = needed_grams

        selected_items.append({
            'name': row['product'],
            'display': display_amount,
            'cost': actual_price
        })
        
        total_cost += actual_price
        consumed['p'] += (row['protein'] * used_grams) / 100
        consumed['f'] += (row['fat'] * used_grams) / 100
        consumed['c'] += (row['carbs'] * used_grams) / 100

    # პასუხის ფორმატირება (HTML-ისთვის)
    is_ok = (total_cost <= budget) if budget > 0 else True
    header_color = "text-green-600" if is_ok else "text-red-600"
    status_text = "ოპტიმალური კალათა" if is_ok else "ბიუჯეტი არასაკმარისია"

    res_html = f"<h3 class='text-xl font-bold {header_color} mb-2'>{status_text}</h3>"
    res_html += f"<p class='mb-4 font-bold'>ჯამური ღირებულება: {total_cost:.2f}₾</p><ul class='space-y-2'>"
    
    for item in selected_items:
        res_html += f"<li class='border-l-4 border-green-500 pl-3'><strong>{item['name']}</strong>: {item['display']} — <span class='text-green-700 font-semibold'>{item['cost']:.2f}₾</span></li>"
    
    res_html += "</ul>"
    res_html += f"<div class='mt-4 p-3 bg-gray-50 rounded-lg text-sm'>"
    res_html += f"<b>მიღებული მაკროები:</b> {round(consumed['p'])}გ ცილა | {round(consumed['f'])}გ ცხიმი | {round(consumed['c'])}გ ნახშირწყალი"
    res_html += f"</div>"
    
    return res_html

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.json
        def to_f(v): return float(v) if v and str(v).strip() != "" else 0.0

        res = solve_diet(
            to_f(data.get('budget')),
            {'p': to_f(data.get('protein')), 'f': to_f(data.get('fat')), 
             'c': to_f(data.get('carbs')), 'cal': to_f(data.get('calories'))},
            pd.read_csv('2nabiji.csv')
        )
        return jsonify({'result': res})
    except Exception as e:
        return jsonify({'result': f"<span class='text-red-500'>შეცდომა: {str(e)}</span>"})

if __name__ == '__main__':
    app.run(debug=True)
