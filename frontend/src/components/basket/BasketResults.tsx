'use client';
import { useState } from 'react';
import { RefreshCw, X, TrendingUp, DollarSign } from 'lucide-react';
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

export function BasketResults() {
  const { basket, totals, targets, replaceItem, removeItem } = useBasketStore();
  const [replacing, setReplacing] = useState<number | null>(null);

  const handleReplace = async (item: BasketItem) => {
    setReplacing(item.id);
    try {
      const existingIds = basket.map((b) => b.id).filter((id) => id !== item.id);
      const { data } = await basketApi.replace(item.id, existingIds);
      const r = data.replacement;
      const gramsPrice = (r.price / (r.total_package_weight || 1000)) * item.grams;
      const newItem: BasketItem = {
        id: r.id,
        product: r.product,
        category: r.category,
        grams: item.grams,
        price: Math.round(gramsPrice * 100) / 100,
        protein: Math.round((r.protein / 100) * item.grams * 10) / 10,
        fat: Math.round((r.fat / 100) * item.grams * 10) / 10,
        carbs: Math.round((r.carbs / 100) * item.grams * 10) / 10,
        calories: Math.round((r.calories / 100) * item.grams * 10) / 10,
        sale_type: r.sale_type,
        is_promo: r.is_promo,
      };
      replaceItem(item.id, newItem);
      toast.success(`${item.product} → ${r.product}`);
    } catch {
      toast.error('ჩანაცვლება ვერ მოხდა');
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
              <span className="font-bold text-primary-700 text-lg">{totals.price.toFixed(2)}₾</span>
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
            <div key={`${item.id}-${item.product}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900 truncate">{item.product}</span>
                  {item.is_promo && (
                    <span className="tag bg-red-50 text-red-600 text-[10px]">🎁 პრომო</span>
                  )}
                  <span className={clsx('tag text-[10px]', CATEGORY_COLORS[item.category] || DEFAULT_TAG)}>
                    {item.category}
                  </span>
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
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-primary-700 text-sm">{item.price.toFixed(2)}₾</span>
                <button
                  onClick={() => handleReplace(item)}
                  disabled={replacing === item.id}
                  title="ჩანაცვლება"
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-all"
                >
                  <RefreshCw size={13} className={replacing === item.id ? 'animate-spin' : ''} />
                </button>
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
