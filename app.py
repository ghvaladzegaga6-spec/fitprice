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
მონაცემთა ბაზა: {products_list}

დავალება:
შეადგინე ყველაზე ბიუჯეტური მენიუ {target_cal} კალორიისა და {target_protein}გ ცილის მისაღებად.

მნიშვნელოვანი წესები:
1. პრიორიტეტია მინიმალური ჯამური ფასი.
2. კვერცხი დაითვალე მხოლოდ ცალობით (მაგ: 3 ცალი). არ გამოიყენო გრამები კვერცხისთვის.
3. სხვა პროდუქტებისთვის გამოიყენე გრამები ან მლ.
4. პასუხი დააბრუნე ქართულად, სუფთა სიის სახით.
5. ბოლო ხაზზე აუცილებლად დაწერე: "ჯამური ხარჯი: [თანხა] ლარი".

ფორმატი:
- [პროდუქტის სახელი]: [რაოდენობა ცალებში ან გრამებში] - [ფასი] ლარი
"""
