import pandas as pd
from flask import Flask, render_template, request
import openai

app = Flask(__name__)

# აქ ჩასვი შენი გასაღები
openai.api_key = "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"

@app.route('/', methods=['GET', 'POST'])
def index():
    recommendation = ""
    if request.method == 'POST':
        store = request.form.get('store')
        target_cal = request.form.get('calories')
        target_protein = request.form.get('protein')
        
        try:
            df = pd.read_csv(f"{store}.csv")
            products_list = df.to_string()
            
            # აი ეს არის ის ტექსტი (პრომპტი), რომელიც აიძულებს AI-ს მოკლედ წერას
            prompt = f"""
            ბაზა: {products_list}
            დავალება: შეადგინე ყველაზე იაფი მენიუ {target_cal} კალორიისა და {target_protein}გ ცილისთვის.
            
            პასუხი დააბრუნე მხოლოდ ამ ფორმატით:
            - პროდუქტი: რაოდენობა - ფასი
            - პროდუქტი: რაოდენობა - ფასი
            
            ჯამური ღირებულება: [თანხა] ლარი.
            
            არ დაწერო არანაირი ტექსტი სიის გარდა. დაიცავი გრამატიკა.
            """
            
            response = openai.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}]
            )
            recommendation = response.choices[0].message.content
        except Exception as e:
            recommendation = f"შეცდომა: {str(e)}"

    return render_template('index.html', recommendation=recommendation)

if __name__ == '__main__':
    app.run(debug=True)