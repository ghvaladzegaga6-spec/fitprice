from flask import Flask, render_template, request, jsonify
import pandas as pd
import math

app = Flask(__name__)

def solve_diet(budget, target, df):
    # მონაცემების ტიპების გარდაქმნა და გასუფთავება
    for col in ['protein', 'fat', 'carbs', 'calories', 'price']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # პროდუქტების დაჯგუფება კატეგორიებად (რომ მრავალფეროვნება აიძულოს)
    # თუ ბაზაში გაქვს 'category' სვეტი, ეს უფრო კარგად იმუშავებს
    selected_items = []
    total_cost = 0
    current = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}
    
    # 1. პრიორიტეტების განსაზღვრა (რა გვაკლია ყველაზე მეტი %)
    def get_deficit():
        def_p = max(0, target['p'] - current['p'])
        def_c = max(0, target['c'] - current['c'])
        def_f = max(0, target['f'] - current['f'])
        def_cal = max(0, target['cal'] - current['cal'])
        return def_p, def_c, def_f, def_cal

    # 2. მთავარი ციკლი - სანამ კალორიების 95%-ს არ მივაღწევთ
    attempts = 0
    while attempts < 20: # მაქსიმუმ 20 სხვადასხვა პროდუქტის შერჩევა
        def_p, def_c, def_f, def_cal = get_deficit()
        
        if def_cal <= 10 or (current['p'] >= target['p'] * 0.98):
            break
            
        # ვეძებთ პროდუქტს, რომელიც საუკეთესოდ ავსებს არსებულ დეფიციტს
        # ფორმულა ითვალისწინებს ფასს და იმ მაკროს, რომელიც ყველაზე მეტად გვაკლია
        df['score'] = (
            (df['protein'] * (def_p/target['p'] if target['p']>0 else 0)) +
            (df['carbs'] * (def_c/target['c'] if target['c']>0 else 0)) +
            (df['calories'] / 100)
        ) / (df['price'] + 0.1)
        
        best_match = df[~df['product'].isin([x['name'] for x in selected_items])].sort_values(by='score', ascending=False).head(1)
        
        if best_match.empty: break
        row = best_match.iloc[0]
        
        # რაოდენობის განსაზღვრა (რომ არ გადააჭარბოს)
        needed_p = (def_p * 100) / row['protein'] if row['protein'] > 0 else 1000
        needed_cal = (def_cal * 100) / row['calories'] if row['calories'] > 0 else 1000
        
        # ვიღებთ იმდენს, რომ რომელიმე მაკრო შეივსოს, მაგრამ სხვას ძალიან არ გადააცილოს
        grams = min(needed_p, needed_cal, 400) # ერთ პროდუქტს 400გ-ზე მეტს არ ვამატებთ მრავალფეროვნებისთვის
        
        if row['pricing_type'] == 'piece':
            # თუ დაფასოებულია, ვამრგვალებთ მთელ პაკეტამდე
            # დავუშვათ საშუალო პაკეტი 400გ-ია ან ცალობითია
            units = math.ceil(grams / 100) if grams > 50 else 1
            cost = units * row['price']
            actual_grams = units * 100 
            display = f"იყიდე {units} შეკვრა/ცალი"
        else:
            # თუ წონითია
            cost = (row['price'] * grams) / 1000
            actual_grams = grams
            display = f"აწონე {round(grams)}გ"

        # ბიუჯეტის შემოწმება
        if budget > 0 and (total_cost + cost) > budget:
            attempts += 1
            continue

        selected_items.append({
            'name': row['product'],
            'display': display,
            'cost': cost
        })
        
        total_cost += cost
        current['p'] += (row['protein'] * actual_grams) / 100
        current['f'] += (row['fat'] * actual_grams) / 100
        current['c'] += (row['carbs'] * actual_grams) / 100
        current['cal'] += (row['calories'] * actual_grams) / 100
        attempts += 1

    return build_html_response(selected_items, total_cost, current, budget)

def build_html_response(items, cost, current, budget):
    is_ok = (cost <= budget) if budget > 0 else True
    html = f"<div class='space-y-4'>"
    html += f"<h3 class='text-xl font-bold {'text-green-600' if is_ok else 'text-orange-600'}'>" 
    html += f"{'✅ იდეალური კომბინაცია' if is_ok else '⚠️ ბიუჯეტური ოპტიმიზაცია'}</h3>"
    html += f"<p class='text-gray-600'>ჯამური ღირებულება: <span class='text-black font-bold'>{cost:.2f}₾</span></p>"
    html += "<div class='grid gap-3'>"
    for item in items:
        html += f"<div class='flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm'>"
        html += f"<div><p class='font-bold text-gray-800'>{item['name']}</p><p class='text-xs text-gray-500'>{item['display']}</p></div>"
        html += f"<div class='text-green-600 font-bold'>{item['cost']:.2f}₾</div></div>"
    html += "</div>"
    html += f"<div class='bg-green-600 text-white p-4 rounded-2xl mt-4 shadow-lg'>"
    html += f"<p class='text-xs opacity-80 uppercase font-bold mb-1'>მიღებული შედეგი:</p>"
    html += f"<div class='flex justify-between font-bold text-sm'>"
    html += f"<span>🔥 {round(current['cal'])} კკალ</span><span>🥩 {round(current['p'])}გ ცილა</span>"
    html += f"<span>🍞 {round(current['c'])}გ ნახშ.</span><span>🥑 {round(current['f'])}გ ცხიმი</span>"
    html += "</div></div></div>"
    return html

# ... დანარჩენი Flask-ის ნაწილი უცვლელია ...
