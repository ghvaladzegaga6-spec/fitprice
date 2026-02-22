import os
import openai
import pandas as pd
from flask import Flask, render_template, request

app = Flask(__name__, template_folder='templates')
openai.api_key = os.getenv("OPENAI_API_KEY")

@app.route('/', methods=['GET', 'POST'])
def index():
    recommendation = ""
    if request.method == 'POST':
        store = request.form.get('store')
        target_cal = request.form.get('calories')
        target_protein = request.form.get('protein')
        budget_limit = request.form.get('budget') # ახალი ველი

        try:
            file_name = f"{store.lower()}.csv"
            if os.path.exists(file_name):
                df = pd.read_csv(file_name)
                db_context = df.to_string(index=False)

                prompt = f"""
                მონაცემთა ბაზა:
                {db_context}

                მოთხოვნა: {target_cal} კალორია, {target_protein}გ ცილა.
                ბიუჯეტის ლიმიტი: {budget_limit} ლარი.

                დავალება:
                შეადგინე ყველაზე იაფი კვების გეგმა მოცემულ ბიუჯეტში.

                კრიტიკული წესები:
                1. პორციის ლიმიტი: არ გასცდე თითოეული პროდუქტის 'max_serving'-ს.
                2. ბიუჯეტის ლიმიტი: ჯამური ღირებულება არ უნდა აღემატებოდეს {budget_limit} ლარს.
                3. მათემატიკა: 
                   - 'piece' ტიპზე გამოიყენე ფასი * რაოდენობა.
                   - 'weight' ტიპზე გამოიყენე (გრამი/1000) * კილოგრამის ფასი.
                4. პრიორიტეტი: პირველ რიგში შეავსე ცილა, შემდეგ კალორიები, ყველაზე იაფად.

                პასუხი დააბრუნე ქართულად:
                - [პროდუქტი]: [რაოდენობა] - [ფასი] ლარი
                
                ბოლო ხაზი: "ჯამური ღირებულება: [ჯამი] ლარი"
                """

                response = openai.ChatCompletion.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "შენ ხარ მკაცრი დიეტოლოგი და ფინანსური მენეჯერი. არასოდეს აჭარბებ ბიუჯეტს და პორციის ზომებს."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0
                )
                recommendation = response.choices[0].message.content
                recommendation = recommendation.replace("ცილი", "ცალი")
            else:
                recommendation = "ბაზა ვერ მოიძებნა."
        except Exception as e:
            recommendation = f"შეცდომა: {str(e)}"

    return render_template('index.html', recommendation=recommendation)
