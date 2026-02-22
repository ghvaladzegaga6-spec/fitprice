import os
import openai
import pandas as pd
from flask import Flask, render_template, request

# Flask-ს ვეუბნებით, რომ HTML ფაილები "templates" საქაღალდეში ეძებოს
app = Flask(__name__, template_folder='templates')

# API გასაღების უსაფრთხო წამოღება
openai.api_key = os.getenv("OPENAI_API_KEY")

@app.route('/', methods=['GET', 'POST'])
def index():
    recommendation = ""
    if request.method == 'POST':
        # მონაცემების წამოღება ფორმიდან
        store = request.form.get('store')
        target_cal = request.form.get('calories')
        target_protein = request.form.get('protein')

        try:
            # .lower() უზრუნველყოფს, რომ "Nikora" გახდეს "nikora" და იპოვოს "nikora.csv"
            file_name = f"{store.lower()}.csv"
            df = pd.read_csv(file_name)
            products_list = df.to_string()

            # AI-სთვის დავალების მიცემა
            prompt = f"""
            ბაზა: {products_list}
            დავალება: შეადგინე ყველაზე იაფი მენიუ {target_cal} კალორიისა და {target_protein}გ ცილისთვის.
            პასუხი დააბრუნე მხოლოდ ამ ფორმატით:
            - პროდუქტი: რაოდენობა - ფასი
            """

            response = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}]
            )
            recommendation = response.choices[0].message.content

        except Exception as e:
            recommendation = f"შეცდომა: მონაცემთა ბაზა ვერ მოიძებნა ან API ლიმიტი ამოიწურა. ({str(e)})"

    return render_template('index.html', recommendation=recommendation)

if __name__ == '__main__':
    app.run(debug=True)
