'use client';
import { useState } from 'react';
import { X, ChefHat, Loader2, Sparkles } from 'lucide-react';
import { nutritionApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { BasketItem, BasketTotals } from '@/store/basket.store';

interface Props {
  basket: BasketItem[];
  totals: BasketTotals | null;
  onClose: () => void;
}

export function RecipeModal({ basket, totals, onClose }: Props) {
  const [recipe, setRecipe] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data } = await nutritionApi.recipe(basket, undefined, totals?.calories);
      setRecipe(data.recipe);
      setGenerated(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'AI სერვისი მიუწვდომელია');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in">
      <div className="card w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
              <ChefHat size={16} className="text-orange-500" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">AI რეცეპტი</h2>
              <p className="text-xs text-gray-400">კალათის პროდუქტებზე დაყრდნობით</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <X size={18} />
          </button>
        </div>

        {/* Products summary */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 shrink-0">
          <p className="text-xs text-gray-500 mb-1.5 font-medium">კალათის პროდუქტები:</p>
          <p className="text-xs text-gray-600 leading-relaxed">
            {basket.slice(0, 8).map(b => b.product).join(' · ')}
            {basket.length > 8 && ` · +${basket.length - 8} სხვა`}
          </p>
        </div>

        {/* Recipe content */}
        <div className="flex-1 overflow-y-auto">
          {!generated && !loading && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-yellow-100 rounded-2xl flex items-center justify-center mb-3">
                <Sparkles size={24} className="text-orange-500" />
              </div>
              <p className="text-gray-500 text-sm mb-1">AI გამოიყენებს თქვენს კალათს</p>
              <p className="text-gray-400 text-xs">და შექმნის ქართულ რეცეპტს</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 size={28} className="animate-spin text-primary-500 mb-3" />
              <p className="text-sm text-gray-500">AI ქმნის რეცეპტს...</p>
            </div>
          )}

          {generated && recipe && (
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed bg-orange-50/50 rounded-xl p-4">
                {recipe}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 shrink-0">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={15} className="animate-spin" /> იქმნება...</>
            ) : generated ? (
              <><RefreshCw size={15} /> ახალი რეცეპტი</>
            ) : (
              <><Sparkles size={15} /> რეცეპტის გენერაცია</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function RefreshCw({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
