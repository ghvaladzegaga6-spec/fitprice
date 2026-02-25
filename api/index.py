@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        csv_path = os.path.join(BASE_DIR, '2nabiji.csv')
        df = pd.read_csv(csv_path)

        # ტიპების გასწორება
        cols = ['protein', 'fat', 'carbs', 'calories', 'price', 'unit_weight']
        for col in cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

        target_p = clean_float(data.get('protein'))
        target_c = clean_float(data.get('carbs'))
        target_f = clean_float(data.get('fat'))

        category = data.get('category', 'all')
        if category != 'all':
            df = df[df['section'] == category].copy()

        # ოპტიმიზაციის მიზანი: ფასი 1 გრამზე (რომ კვერცხის რაოდენობაც სწორად დათვალოს)
        # piece პროდუქტებისთვის ფასს ვყოფთ მის სავარაუდო მთლიან წონაზე (მაგ: 10 ცალი * unit_weight)
        costs = []
        for _, row in df.iterrows():
            if row['pricing_type'] == 'piece' and row['unit_weight'] > 0:
                # მაგ: 4.50 ლარიანი კვერცხი (10ც) იწონის 500გ-ს. 1გ-ის ფასი = 4.5/500
                total_pkg_weight = row['unit_weight'] * 10 
                costs.append(row['price'] / total_pkg_weight)
            else:
                costs.append(row['price'] / 1000)

        def solve_with_tolerance(tol):
            A_ub = [
                df['protein'].tolist(), [-p for p in df['protein'].tolist()],
                df['carbs'].tolist(), [-c for c in df['carbs'].tolist()],
                df['fat'].tolist(), [-f for f in df['fat'].tolist()]
            ]
            b_ub = [
                target_p * (1 + tol), -target_p * (1 - tol),
                target_c * (1 + tol), -target_c * (1 - tol),
                target_f * (1 + tol), -target_f * (1 - tol)
            ]
            # Bounds: თითოეული პროდუქტი 0 ან 1.5-დან (150გ) 5.0-მდე (500გ)
            # რადგან linprog-ს უჭირს "ან 0 ან 1.5", ვიყენებთ 0-5 და მერე ვფილტრავთ მკაცრად
            return linprog(c=costs, A_ub=A_ub, b_ub=b_ub, bounds=(0, 5), method='highs')

        res = solve_with_tolerance(0.03) # 3% სიზუსტე
        if not res.success:
            res = solve_with_tolerance(0.07) # 7% სიზუსტე

        if not res.success:
            return jsonify({"error": "ვერ მოიძებნა ვარიანტი. სცადეთ მაკროების შეცვლა."})

        final_items = []
        total_spending = 0
        totals = {'p': 0, 'f': 0, 'c': 0, 'cal': 0}

        for i, x in enumerate(res.x):
            grams = x * 100
            row = df.iloc[i]
            
            # მკაცრი ინდივიდუალური შეზღუდვა: 150გ - 500გ
            # გამონაკლისი: კვერცხი (ცალობითი), რომელსაც 150გ-ზე ნაკლებიც შეუძლია იყოს სიზუსტისთვის
            is_piece = row['pricing_type'] == 'piece'
            if grams < 145 and not is_piece:
                continue 
            if grams < 10: # საერთოდ თუ არ აირჩია
                continue

            unit_w = float(row['unit_weight'])
            if is_piece:
                cost = float(row['price']) # მთლიანი შეკვრის ფასი
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
                "cost": round(cost, 2)
            })
            
            total_spending += cost
            totals['p'] += (row['protein'] * grams) / 100
            totals['f'] += (row['fat'] * grams) / 100
            totals['c'] += (row['carbs'] * grams) / 100
            totals['cal'] += (row['calories'] * grams) / 100

        return jsonify({
            "items": final_items,
            "total_cost": round(total_spending, 2),
            "totals": {k: round(v, 1) for k, v in totals.items()}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
