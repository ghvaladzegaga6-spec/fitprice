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
        
        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()

        costs = (df['price'] / 1000).tolist() # საბაზისო ფასი 1 გრამზე

        # ოპტიმიზაციის ფუნქცია დინამიური ბარიერებით
        def try_solve(min_g, max_g):
            A_ub = []
            b_ub = []
            # პირობა: მაკროები უნდა იყოს მინიმუმ იმდენი, რამდენიც მომხმარებელმა შეიტანა
            if target_p > 0:
                A_ub.append((-df['protein']).tolist()); b_ub.append(-target_p)
            if target_c > 0:
                A_ub.append((-df['carbs']).tolist()); b_ub.append(-target_c)
            if target_f > 0:
                A_ub.append((-df['fat']).tolist()); b_ub.append(-target_f)
            
            # bounds იღებს მნიშვნელობებს 100გ-ზე დაყოფით (მაგ: 300გ = 3.0)
            return linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, max_g/100), method='highs')

        # 1. ვცდილობთ შენს იდეალურ დიაპაზონს [150გ - 300გ]
        res = try_solve(150, 300)

        # 2. თუ ვერ იპოვა, ოდნავ ვუფართოებთ არეალს [100გ - 400გ]
        if not res.success:
            res = try_solve(100, 400)

        if not res.success:
            return jsonify({"error": "მოთხოვნები ძალიან მაღალია ან დაბალია არსებული პროდუქტებისთვის."})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            grams = x * 100
            if grams < 50: continue # იგნორირება ძალიან მცირე რაოდენობების
            
            row = df.iloc[i]
            # ვაიძულებთ მინიმუმ 150გ-ს, თუ ალგორითმმა უფრო ნაკლები აირჩია
            if grams < 150: grams = 150
            if grams > 300: grams = 300 # ზედა ზღვრის დაზღვევა

            unit_w = float(row['unit_weight'])
            is_piece = row['pricing_type'] == 'piece'

            if is_piece and unit_w > 0:
                count = round(grams / unit_w)
                if count == 0: count = 1
                final_grams = count * unit_w
                instr = f"იყიდე 1 შეკვრა (გამოიყენე {count} ცალი)"
                cost = float(row['price'])
            else:
                final_grams = grams
                instr = f"აწონე ~{round(grams)}გ"
                cost = (float(row['price']) * grams) / 1000

            final_items.append({
                "name": str(row['product']),
                "display": instr,
                "cost": round(cost, 2)
            })
            
            total_spending += cost
            totals['p'] += (row['protein'] * final_grams) / 100
            totals['f'] += (row['fat'] * final_grams) / 100
            totals['c'] += (row['carbs'] * final_grams) / 100
            totals['cal'] += (row['calories'] * final_grams) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
