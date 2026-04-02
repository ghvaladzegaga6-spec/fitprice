import { create } from 'zustand';

export interface BasketItem {
  id: number;
  product: string;
  category: string;
  grams: number;
  price: number;
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
  sale_type: string;
  is_promo: boolean;
  pkg_note?: string | null;
  pkg_total_weight?: number | null;
  owned?: boolean;
}

export interface BasketTotals {
  price: number;
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
}

interface BasketStore {
  basket: BasketItem[];
  totals: BasketTotals | null;
  targets: BasketTotals | null;
  isLoading: boolean;
  setBasket: (basket: BasketItem[], totals: BasketTotals, targets: BasketTotals) => void;
  setLoading: (v: boolean) => void;
  replaceItem: (oldId: number, newItem: BasketItem) => void;
  removeItem: (id: number) => void;
  updateItem: (id: number, updated: BasketItem) => void;
  clearBasket: () => void;
}

export const useBasketStore = create<BasketStore>((set, get) => ({
  basket: [],
  totals: null,
  targets: null,
  isLoading: false,

  setBasket: (basket, totals, targets) => set({ basket, totals, targets }),
  setLoading: (v) => set({ isLoading: v }),

  replaceItem: (oldId, newItem) => {
    const basket = get().basket.map(item =>
      item.id === oldId ? newItem : item
    );
    const totals = calcTotals(basket);
    set({ basket, totals });
  },

  removeItem: (id) => {
    const basket = get().basket.filter(item => item.id !== id);
    const totals = calcTotals(basket);
    set({ basket, totals });
  },

  updateItem: (id, updated) => {
    const basket = get().basket.map(item =>
      item.id === id ? updated : item
    );
    // totals-ში owned პროდუქტების კალორიები ითვლება, მაგრამ ფასი არა
    const totals = calcTotals(basket);
    set({ basket, totals });
  },

  clearBasket: () => set({ basket: [], totals: null, targets: null }),
}));

function calcTotals(basket: BasketItem[]): BasketTotals {
  return {
    price: basket.filter(i => !i.owned).reduce((s, i) => s + i.price, 0),
    protein: basket.reduce((s, i) => s + i.protein, 0),
    fat: basket.reduce((s, i) => s + i.fat, 0),
    carbs: basket.reduce((s, i) => s + i.carbs, 0),
    calories: basket.reduce((s, i) => s + i.calories, 0),
  };
}
