def solve_diet(budget, target_macros, products_df):
    selected_items = []
    total_cost = 0
    consumed_macros = {'p': 0, 'f': 0, 'c': 0}

    for _, row in products_df.iterrows():
        if consumed_macros['p'] >= target_macros['protein']: break # მაგალითისთვის ცილაზე

        # 1. გამოთვლა: რამდენი გრამია საჭირო მაკროებისთვის?
        needed_p = target_macros['protein'] - consumed_macros['p']
        use_amount = (needed_p * 100) / row['protein']

        # 2. ფასის ლოგიკა
        if row['pricing_type'] == 'piece':
            # დაფასოებულია: ვიხდით მთლიან ფასს
            actual_price = row['price']
            display_amount = f"იყიდე 1 შეკვრა, გამოიყენე {round(use_amount)}გ"
        else:
            # აწონვადია: ვიხდით მხოლოდ იმას, რასაც ავწონით
            actual_price = (row['price'] * use_amount) / 1000 # თუ ფასი 1 კგ-ზეა
            display_amount = f"აწონე {round(use_amount)}გ"

        if total_cost + actual_price > budget:
            continue

        selected_items.append({
            'name': row['product'],
            'display': display_amount,
            'cost': actual_price
        })
        
        total_cost += actual_price
        consumed_macros['p'] += needed_p # პირობითად

    return generate_final_response(selected_items, total_cost, budget)

def generate_final_response(items, total_price, budget):
    res = "### ✅ ოპტიმალური კალათა\n" if total_price <= budget else "### ⚠️ ბიუჯეტი არ არის საკმარისი\n"
    res += f"**ჯამური ხარჯი: {total_price:.2f}₾**\n\n"
    
    for item in items:
        res += f"* **{item['name']}** - {item['display']} | ფასი: {item['cost']:.2f}₾\n"
    
    return res
