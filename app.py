import os
import openai
import pandas as pd
from flask import Flask, render_template, request

app = Flask(__name__, template_folder='templates')

# გასაღებს ვიღებთ Render-ის Environment Variables-დან
openai.api_key = os.getenv("OPENAI_API_KEY")

@app.route('/', methods=['GET', 'POST'])
def index():
    recommendation = ""
    if request.method == 'POST':
        store = request.form.get('store')
        target_cal = request.form.get('calories')
        target_protein = request.form.get('protein')

        try:
            # მაღაზიის სახელს ვაქცევთ პატარა ასოებად (.lower()), რომ CSV იპოვოს
            file_name = f"{store.lower()}.csv"
            
            if os.path.exists(file_name):
                df = pd.read_csv(file_name)
                products_list = df.to_string()

                prompt = f"""
                ბაზა: {products_list}
                დავალება: შეადგინე ყველაზე იაფი მენიუ {target_cal} კალორიისა და {target_protein}გ ცილისთვის.
                პასუხი დააბრუნე ქართულად, ამ ფორმატით:
                - პროდუქტი: რაოდენობა - ფასი
                """

                # ეს ფორმატი მუშაობს openai==0.28 ვერსიაზე
                response = openai.ChatCompletion.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": prompt}]
                )
                recommendation = response.choices[0].message.content
            else:
                recommendation = f"შეცდომა: მონაცემთა ბაზა ({file_name}) ვერ მოიძებნა."

        except Exception as e:
            recommendation = f"მოხდა შეცდომა: {str(e)}"

    return render_template('index.html', recommendation=recommendation)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
