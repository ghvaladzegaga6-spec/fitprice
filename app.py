from flask import Flask, render_template, request, jsonify
import pandas as pd

app = Flask(__name__)

def solve_diet(budget, target_macros, df):
    # პროდუქტების დალაგება ცილის ეფექტურობით
    df['efficiency'] = df['protein'] / df['price']
    df = df.sort_values(by='efficiency', ascending=False)

    selected_items = []
    total_cost = 0
    consumed = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

    for _, row in df.iterrows():
        # ვჩერდებით, თუ მაკროები (მაგ. ცილა) შეივსო
        if consumed['p'] >= target_macros['p']:
            break

        needed_p = max(0, target_macros['p'] - consumed['p'])
        # ვიანგარიშებთ საჭირო გრამებს
        use_amount = (needed_p * 100) / row['protein']

        if row['pricing_type'] == 'piece':
            actual_price = row['price']
            display_amount = f"იყიდე 1 შეკვრა, გამოიყენე {round(use_amount)}გ"
        else:
            # 1კგ-ის ფასიდან გრამების ფასზე გადაყვანა
            actual_price = (row['price'] * use_amount) / 1000
            display_amount = f"აწონე {round(use_amount)}გ"

        selected_items.append({
            'name': row['product'],
            'display': display_amount,
            'cost': actual_price
        })
        
        total_cost += actual_price
        consumed['p'] += (row['protein'] * use_amount) / 100
        consumed['f'] += (row['fat'] * use_amount) / 100
        consumed['c'] += (row['carbs'] * use_amount) / 100

    # პასუხის ფორმატირება
    # თუ ბიუჯეტი 0-ია, ჩავთვალოთ რომ შეზღუდვა არ გვაქვს
    is_enough = (total_cost <= budget) if budget > 0 else True
    status = "✅ ოპტიმალური კალათა" if is_enough else "⚠️ ბიუჯეტი არ არის საკმარისი"
    
    response = f"### {status}\n"
    if budget > 0 and not is_enough:
        response += f"ამ მაკროებისთვის მინიმუმ საჭიროა: **{total_cost:.2f}₾**\n\n"
    else:
        response += f"**ჯამური ხარჯი: {total_cost:.2f}₾**\n\n"

    for item in selected_items:
        response += f"* **{item['name']}** - {item['display']} | {item['cost']:.2f}₾\n"
    
    response += f"\n**ჯამში:** {round(consumed['p'])}გ ცილა | {round(consumed['f'])}გ ცხიმი | {round(consumed['c'])}გ ნახშირწყალი"
    
    return response

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.json
        
        # დამხმარე ფუნქცია ტექსტის რიცხვად გადასაყვანად (ცარიელი ველის თავიდან ასაცილებლად)
        def clean_float(val):
            if val is None or str(val).strip() == "":
                return 0.0
            return float(val)

        budget = clean_float(data.get('budget'))
        target_macros = {
            'p': clean_float(data.get('protein')),
            'f': clean_float(data.get('fat')),
            'c': clean_float(data.get('carbs')),
            'cal': clean_float(data.get('calories'))
        }

        # CSV-ს წაკითხვა
        df = pd.read_csv('2nabiji.csv')
        
        result = solve_diet(budget, target_macros, df)
        return jsonify({'result': result})
    except Exception as e:
        return jsonify({'result': f"მოხდა შეცდომა მონაცემების დამუშავებისას: {str(e)}"})

if __name__ == '__main__':
    app.run(debug=True)
