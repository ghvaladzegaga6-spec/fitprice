import os
import openai
import pandas as pd
from flask import Flask, render_template, request

# Flask აპლიკაციის ინიციალიზაცია
app = Flask(__name__, template_folder='templates')

# OpenAI API გასაღები (Render-ის გარემოდან)
openai.api_key = os.getenv("OPENAI_API_KEY")

@app.route('/', methods=['GET', 'POST'])
def index():
    recommendation = ""
    if request.method == 'POST':
        # მონაცემების წამოღება საიტიდან
        store = request.form.get('store')
        target_cal = request.form.get('calories')
        target_protein = request.form.get('protein')
        target_carbs = request.form.get('carbs') or "არ არის მითითებული"
        target_fat = request.form.get('fat') or "არ არის მითითებული"
        budget_limit = request.form.get('budget')

        try:
            # მაღაზიის ფაილის სახელი (მაგ: nikora.csv)
            file_name = f"{store.lower()}.csv"
            
            if os.path.exists(file_name):
                df = pd.read_csv(file_name)
                products_list = df.to_string(index=False)

                # ბიუჯეტის ლოგიკის განსაზღვრა პრომპტისთვის
                budget_clause = f"მომხმარებლის სასურველი ბიუჯეტია {budget_limit} ლარი." if budget_limit else "ბიუჯეტი შეუზღუდავია, იპოვე ყველაზე იაფი ალტერნატივა."

                prompt = f"""
                მონაცემთა ბაზა:
                {products_list}

                მოთხოვნა: {target_cal} კალორია, {target_protein}გ ცილა, {target_carbs}გ ნახშირწლები, {target_fat}გ ცხიმი.
                {budget_clause}

                დავალება:
                1. იპოვე ყველაზე იაფი კომბინაცია, რომელიც მაქსიმალურად ზუსტად ავსებს ამ მაკროებს.
                2. თუ მომხმარებელმა მიუთითა ბიუჯეტი ({budget_limit} ₾) და ამ ბიუჯეტში ფიზიკურად შეუძლებელია მაკროების შევსება:
                   - პირველ ხაზზე დაწერე: "სამწუხაროდ, მითითებული ბიუჯეტით ({budget_limit} ₾) ამ მაკროების მიღება შეუძლებელია."
                   - შემდეგ გამოიტანე რეალურად ყველაზე მინიმალური ბიუჯეტური გზა ამ შედეგისთვის.
                3. თუ ბიუჯეტი საკმარისია ან არ არის მითითებული, პირდაპირ გამოიტანე ყველაზე იაფი გეგმა.

                მკაცრი წესები:
                - კვერცხი (piece) დათვალე მხოლოდ ცალობით.
                - სხვა პროდუქტები (weight) დათვალე გრამებში.
                - არ გასცდე 'max_limit'-ს თითოეული პროდუქტისთვის.
                - გამოიყენე სიტყვა "ცალი" (და არა "ცილი").
                - პასუხი დააბრუნე ქართულად.
                - ბოლო ხაზზე დააჯამე: "ჯამური ღირებულება: [თანხა] ლარი".
                """

                # AI მოთხოვნა
                response = openai.ChatCompletion.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "შენ ხარ ზუსტი მათემატიკოსი და დიეტოლოგი. ითვლი მინიმალურ ბიუჯეტს."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0
                )
                recommendation = response.choices[0].message.content
                # დაზღვევა შეცდომით დაწერილი სიტყვისთვის
                recommendation = recommendation.replace("ცილი", "ცალი")
            else:
                recommendation = f"შეცდომა: მაღაზიის მონაცემთა ბაზა ({file_name}) ვერ მოიძებნა."

        except Exception as e:
            recommendation = f"მოხდა შეცდომა: {str(e)}"

    return render_template('index.html', recommendation=recommendation)

if __name__ == '__main__':
    # Render-ის პორტის კონფიგურაცია
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
