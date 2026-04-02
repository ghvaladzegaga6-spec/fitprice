'use client';
import { useState } from 'react';
import { RefreshCw, X, TrendingUp, DollarSign, CheckCircle, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { basketApi } from '@/lib/api';
import { useBasketStore, BasketItem } from '@/store/basket.store';
import { clsx } from 'clsx';

const CATEGORY_COLORS: Record<string, string> = {
  'ბოსტნეული': 'bg-green-50 text-green-700',
  'ხილი': 'bg-orange-50 text-orange-700',
  'ხორცი': 'bg-red-50 text-red-700',
  'ქათამი': 'bg-yellow-50 text-yellow-700',
  'რძის პროდუქტი': 'bg-blue-50 text-blue-700',
  'მარცვლეული და ბურღულეული': 'bg-amber-50 text-amber-700',
  'ყველი': 'bg-purple-50 text-purple-700',
};
const DEFAULT_TAG = 'bg-gray-50 text-gray-600';

// ყველა კატეგორია
const ALL_CATEGORIES = [
  'ბოსტნეული', 'ხილი', 'ციტრუსი', 'მწვანილები',
  'ქათამი', 'ნედლი ხორცი', 'საქონელი', 'ღორი', 'ფარშრებული',
  'გაყინული თევზი', 'ზღვის პროდუქტები', 'შებოლილი თევზი',
  'კვერცხი', 'კონსერვები',
  'მაკარონი', 'მარცვლეული და ბურღულეული', 'პურ-ფუნთუშეული',
  'ფანტელი და მიუსელი', 'სიმინდის ფანტელი',
  'იოგურტი & პუდიგრი', 'მაწონი', 'კეფირი & აირანი',
  'რძე & ნაღები', 'ყველი', 'რძის სიკვიტი', 'არაჟანი',
  'კარაქი & სპრედი', 'მაიონეზი & სოუსები',
  'შაქარი', 'თაფლი, მურაბა & ჯემი', 'ტკბილეული და ნაყინი',
  'შესქელებული რძე', 'ძეხვეული', 'სნექი',
  'სწრაფად მოსამზადებელი საკვები',
  'მარილი', 'მარინადი', 'ძმარი', 'საცხობი საშუალებები', 'სასმელები',
];

export function BasketResults() {
  const { basket, totals, targets, replaceItem, removeItem, updateItem } = useBasketStore();
  const [replacing, setReplacing] = useState<number | null>(null);
  const [catMenuOpen, setCatMenuOpen] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<Record<number, 'asc' | 'desc'>>({});

  // "უკვე მაქვს" toggle
  const toggleOwned = (item: BasketItem) => {
    const updated = { ...item, owned: !item.owned };
    updateItem(item.id, updated);
    toast.success(!item.owned ? '✅ სახლში გაქვს — ფასიდან გამოაკლდა' : '🛒 ფასში დაბრუნდა');
  };

  // პროდუქტის შეცვლა (იგივე კატეგორია, ფასის მიხედვით)
  const handleReplace = async (item: BasketItem, newCategory?: string) => {
    setReplacing(item.id);
    setCatMenuOpen(null);
    try {
      const existingIds = basket.map((b) => b.id).filter((id) => id !== item.id);
      const dir = priceDirection[item.id] || 'asc';
      const { data } = await basketApi.replace(item.id, existingIds, item.calories, newCategory, dir);
      const r = data.replacement;
      const newItem: BasketItem = {
        id: r.id,
        product: r.product,
        category: r.category,
        grams: r.grams,
        price: r.price,
        protein: r.protein,
        fat: r.fat,
        carbs: r.carbs,
        calories: r.calories,
        sale_type: r.sale_type,
        is_promo: r.is_promo,
        pkg_note: r.pkg_note,
        pkg_total_weight: r.pkg_total_weight,
        owned: false,
      };
      replaceItem(item.id, newItem);
      // შემდეგ შეცვლაზე ძვირი მიმართულება
      setPriceDirection(prev => ({ ...prev, [newItem.id]: 'desc' }));
      toast.success(`${item.product} → ${r.product}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'ჩანაცვლება ვერ მოხდა');
    } finally {
      setReplacing(null);
    }
  };

  const match = (val: number, target: number) => {
    const pct = target > 0 ? (val / target) * 100 : 100;
    if (pct >= 90 && pct <= 115) return 'text-green-600';
    if (pct >= 75) return 'text-yellow-600';
    return 'text-red-500';
  };

  // ფასი owned გარეშე
  const activePrice = basket
    .filter(i => !i.owned)
    .reduce((s, i) => s + i.price, 0);

  return (
    <div className="space-y-4">
      {/* Totals Card */}
      {totals && (
        <div className="card bg-gradient-to-br from-primary-50 to-accent-50 border-primary-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp size={16} className="text-primary-600" />
              შედეგები
            </h3>
            <div className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-1.5 shadow-sm">
              <DollarSign size={14} className="text-primary-600" />
              <span className="font-bold text-primary-700 text-lg">{activePrice.toFixed(2)}₾</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'კკალ', val: totals.calories, target: targets?.calories },
              { label: 'ცილა', val: totals.protein, target: targets?.protein, unit: 'გ' },
              { label: 'ცხიმი', val: totals.fat, target: targets?.fat, unit: 'გ' },
              { label: 'ნახ.', val: totals.carbs, target: targets?.carbs, unit: 'გ' },
            ].map(({ label, val, target, unit = '' }) => (
              <div key={label} className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                <div className={`font-bold text-base ${match(val, target || 0)}`}>
                  {Math.round(val)}{unit}
                </div>
                <div className="text-xs text-gray-400">{label}</div>
                {target && (
                  <div className="text-xs text-gray-300">/{Math.round(target)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product List */}
      <div className="card p-0 overflow-hidden">
        <div className="divide-y divide-gray-50">
          {basket.map((item) => (
            <div
              key={`${item.id}-${item.product}`}
              className={clsx(
                'flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition group relative',
                item.owned && 'opacity-60'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx(
                    'font-medium text-sm text-gray-900 truncate',
                    item.owned && 'line-through text-gray-400'
                  )}>
                    {item.product}
                  </span>
                  {item.is_promo && (
                    <span className="tag bg-red-50 text-red-600 text-[10px]">🎁 პრომო</span>
                  )}
                  <span className={clsx('tag text-[10px]', CATEGORY_COLORS[item.category] || DEFAULT_TAG)}>
                    {item.category}
                  </span>
                  {item.owned && (
                    <span className="tag bg-green-50 text-green-600 text-[10px]">✅ სახლში მაქვს</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{item.grams}გ</span>
                  <span>·</span>
                  <span>{item.calories} კკალ</span>
                  <span>·</span>
                  <span>ც:{item.protein}გ</span>
                  <span>ცხ:{item.fat}გ</span>
                  <span>ნ:{item.carbs}გ</span>
                </div>
                {/* pkg_note */}
                {item.pkg_note && (
                  <div className="mt-1 text-xs text-blue-600 bg-blue-50 rounded-lg px-2 py-1">
                    {item.pkg_note}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <span className={clsx(
                  'font-semibold text-sm',
                  item.owned ? 'line-through text-gray-300' : 'text-primary-700'
                )}>
                  {item.price.toFixed(2)}₾
                </span>

                {/* უკვე მაქვს */}
                <button
                  onClick={() => toggleOwned(item)}
                  title={item.owned ? 'ფასში დაბრუნება' : 'უკვე მაქვს'}
                  className={clsx(
                    'p-1.5 rounded-lg transition-all',
                    item.owned
                      ? 'text-green-600 bg-green-50'
                      : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-green-600 hover:bg-green-50'
                  )}
                >
                  <CheckCircle size={13} />
                </button>

                {/* კატეგორიის შეცვლა */}
                <div className="relative">
                  <button
                    onClick={() => setCatMenuOpen(catMenuOpen === item.id ? null : item.id)}
                    title="კატეგორიის შეცვლა"
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center gap-0.5"
                  >
                    <ChevronDown size={13} />
                  </button>
                  {catMenuOpen === item.id && (
                    <div className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-52 max-h-64 overflow-y-auto">
                      <div className="px-3 py-2 text-xs text-gray-500 font-medium border-b">კატეგორია</div>
                      {ALL_CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          onClick={() => handleReplace(item, cat)}
                          className={clsx(
                            'w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition',
                            cat === item.category && 'font-medium text-primary-600'
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ჩანაცვლება */}
                <button
                  onClick={() => handleReplace(item)}
                  disabled={replacing === item.id}
                  title="შეცვლა (ფასის ზრდით)"
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-all"
                >
                  <RefreshCw size={13} className={replacing === item.id ? 'animate-spin' : ''} />
                </button>

                {/* წაშლა */}
                <button
                  onClick={() => { removeItem(item.id); toast.success('პროდუქტი წაიშალა'); }}
                  title="წაშლა"
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
