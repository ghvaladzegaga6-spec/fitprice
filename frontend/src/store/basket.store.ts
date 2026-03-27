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
}

export interface BasketTotals {
  price: number;
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
}

interface BasketState {
  basket: BasketItem[];
  totals: BasketTotals | null;
  targets: BasketTotals | null;
  isLoading: boolean;
  setBasket: (basket: BasketItem[], totals: BasketTotals, targets: BasketTotals) => void;
  replaceItem: (oldId: number, newItem: BasketItem) => void;
  removeItem: (id: number) => void;
  setLoading: (v: boolean) => void;
  reset: () => void;
}

export const useBasketStore = create<BasketState>((set, get) => ({
  basket: [],
  totals: null,
  targets: null,
  isLoading: false,

  setBasket: (basket, totals, targets) => set({ basket, totals, targets }),

  replaceItem: (oldId, newItem) => {
    const basket = get().basket.map((item) => (item.id === oldId ? newItem : item));
    // Recalculate totals
    const totals = basket.reduce(
      (acc, item) => ({
        price: acc.price + item.price,
        protein: acc.protein + item.protein,
        fat: acc.fat + item.fat,
        carbs: acc.carbs + item.carbs,
        calories: acc.calories + item.calories,
      }),
      { price: 0, protein: 0, fat: 0, carbs: 0, calories: 0 }
    );
    set({ basket, totals: {
      price: Math.round(totals.price * 100) / 100,
      protein: Math.round(totals.protein * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      calories: Math.round(totals.calories * 10) / 10,
    }});
  },

  removeItem: (id) => {
    const basket = get().basket.filter((item) => item.id !== id);
    set({ basket });
  },

  setLoading: (v) => set({ isLoading: v }),
  reset: () => set({ basket: [], totals: null, targets: null }),
}));
