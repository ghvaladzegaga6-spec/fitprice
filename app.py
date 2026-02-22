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

დავალება:
შეადგინე ყველაზე ბიუჯეტური მენიუ {target_cal} კალორიისა და {target_protein}გ ცილის მისაღებად.

წესები:
1. პასუხი დააბრუნე ქართულად.
2. თითოეული პროდუქტი დაწერე ახალ ხაზზე.
3. თუ პროდუქტი არის 'კვერცხი', დათვალე ცალობით (მაგ: 5 ცალი) და არა გრამებით.
4. სხვა პროდუქტებისთვის მიუთითე ზუსტი რაოდენობა (გრამი ან მლ).
5. ბოლოში აუცილებლად დაწერე: "ჯამური ღირებულება: [თანხა] ლარი".

ფორმატი:
- [პროდუქტის სახელი]: [რაოდენობა] - [ფასი] ლარი
"""
