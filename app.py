def solve_diet(budget, target_macros, products_df):
    selected_items = []
    total_cost = 0
    # რეალურად მიღებული მაკროების ათვლა
    consumed = {'p': 0, 'f': 0, 'c': 0}

    # ვახდენთ პროდუქტების სორტირებას (მაგ. ცილის ეფექტურობით)
    df = products_df.copy()
    df['efficiency'] = df['protein'] / df['price']
    df = df.sort_values(by='efficiency', ascending=False)

    for _, row in df.iterrows():
        # ვამოწმებთ, გვჭირდება თუ არა კიდევ რამე
        if consumed['p'] >= target_macros['protein'] and \
           consumed['f'] >= target_macros['fat'] and \
           consumed['c'] >= target_macros['carbs']:
            break

        # ვიანგარიშებთ საჭირო რაოდენობას (ყველაზე დეფიციტური მაკროს მიხედვით)
        # ამ მაგალითში ავიღოთ ცილა, როგორც მთავარი ორიენტირი
        needed_p = max(0, target_macros['protein'] - consumed['p'])
        if needed_p <= 0: continue
        
        use_amount = (needed_p * 100) / row['protein']

        # ფასის ლოგიკა
        if row['pricing_type'] == 'piece':
            actual_price = row['price']
            display_amount = f"იყიდე 1 შეკვრა, გამოიყენე {round(use_amount)}გ"
        else:
            # 1კგ-ის ფასიდან გრამების ფასზე გადაყვანა
            actual_price = (row['price'] * use_amount) / 1000
            display_amount = f"აწონე {round(use_amount)}გ"

        # ბიუჯეტის კონტროლი
        if total_cost + actual_price > budget + 5: # ვაძლევთ 5 ლარიან "ცდომილებას"
            continue

        selected_items.append({
            'name': row['product'],
            'display': display_amount,
            'cost': actual_price
        })
        
        total_cost += actual_price
        consumed['p'] += (row['protein'] * use_amount) / 100
        consumed['f'] += (row['fat'] * use_amount) / 100
        consumed['c'] += (row['carbs'] * use_amount) / 100

    return generate_final_response(selected_items, total_cost, budget, consumed)

def generate_final_response(items, total_price, budget, macros):
    # მაქსიმალურად მოკლე ფორმატი
    status = "✅ ოპტიმალური კალათა" if total_price <= budget else "⚠️ ბიუჯეტი არ არის საკმარისი"
    res = f"### {status}\n**ჯამური ხარჯი: {total_price:.2f}₾**\n\n"
    
    for item in items:
        res += f"* **{item['name']}** - {item['display']} | {item['cost']:.2f}₾\n"
    
    res += f"\n**ჯამში:** {round(macros['p'])}გ ცილა | {round(macros['f'])}გ ცხიმი | {round(macros['c'])}გ ნახშირწყალი"
    return res
