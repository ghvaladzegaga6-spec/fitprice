@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        df = pd.read_csv(csv_path)

        # მონაცემების ტიპების გასწორება
        cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        target_p = clean_float(data.get('protein'))
        target_c = clean_float(data.get('carbs'))
        target_f = clean_float(data.get('fat'))

        # 1. ფილტრაცია სექციის მიხედვით
        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()

        # 2. ქვედა და ზედა ზღვრის დაწესება (გრამებში)
        # ჩვენი მიზანია x (რაოდენობა 100გ-ზე) იყოს ან 0, ან 2.0-დან 5.0-მდე
        # ამისთვის ვიყენებთ 'bounds', მაგრამ linprog-ს მაინც სჭირდება დახმარება
        
        obj = (df['price'] / 10).tolist()
        
        # შეზღუდვები (±15% ცდომილება)
        A_ub = [
            df['protein'].tolist(), [-p for p in df['protein'].tolist()],
            df['carbs'].tolist(), [-c for c in df['carbs'].tolist()],
            df['fat'].tolist(), [-f for f in df['fat'].tolist()]
        ]
        b_ub = [
            target_p * 1.15, -target_p * 0.85,
            target_c * 1.15, -target_c * 0.85,
            target_f * 1.15, -target_f * 0.85
        ]

        #Bounds: მინიმალური 2.0 (200გ) - მაქსიმალური 5.0 (500გ)
        # მნიშვნელოვანი: bounds აქ მხოლოდ მათთვისაა, ვინც შერჩეული იქნება
        res = linprog(c=obj, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')

        if not res.success:
            return jsonify({"error": "ვერ მოიძებნა ბიუჯეტური ვარიანტი ამ მაკროებით (200გ-500გ დიაპაზონში)"})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        # 3. შედეგების მკაცრი ვალიდაცია
        for i, x in enumerate(res.x):
            grams = x * 100
            row = df.iloc[i]
            
            # თუ პროდუქტი შერჩეულია, მან უნდა დააკმაყოფილოს შენი პირობა
            # გამონაკლისი მხოლოდ კვერცხზე (ცალობითზე), რადგან 2 კვერცხი 100გ-ია
            is_piece = row['pricing_type'] == 'piece'
            min_limit = 10 if is_piece else 190 # 190 რომ მცირე დამრგვალება აიტანოს

            if grams >= min_limit:
                unit_w = float(row['unit_weight'])
                
                if is_piece:
                    cost = float(row['price'])
                    if unit_w > 0:
                        count = round(grams / unit_w)
                        if count == 0: count = 1
                        instr = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                    else:
                        instr = f"იყიდე 1 შეკვრა (გამოიყენე ~{round(grams)}გ)"
                else:
                    cost = (float(row['price']) * grams) / 1000
                    instr = f"აწონე ~{round(grams)}გ"

                final_items.append({
                    "name": str(row['product']),
                    "display": instr,
                    "cost": round(cost, 2),
                    "grams": round(grams) # ტესტისთვის დავამატე
                })
                
                total_spending += cost
                totals['p'] += (row['protein'] * grams) / 100
                totals['f'] += (row['fat'] * grams) / 100
                totals['c'] += (row['carbs'] * grams) / 100
                totals['cal'] += (row['calories'] * grams) / 100

        # თუ ფილტრის შემდეგ არაფერი დარჩა
        if not final_items:
             return jsonify({"error": "მოთხოვნილი რაოდენობა (200გ-500გ) ვერ ერგება ამ მაკროებს."})

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
