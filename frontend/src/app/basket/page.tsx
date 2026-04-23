'use client';
import { useState, useEffect } from 'react';
import { Calculator, ShoppingCart, Gift, Filter, ChefHat, Leaf } from 'lucide-react';
import toast from 'react-hot-toast';
import { basketApi } from '@/lib/api';
import { useBasketStore } from '@/store/basket.store';
import { BasketCalculator } from '@/components/basket/BasketCalculator';
import { BasketResults } from '@/components/basket/BasketResults';
import { CategoryFilter } from '@/components/basket/CategoryFilter';
import { PromoPopup } from '@/components/basket/PromoPopup';
import { AdsRotator } from '@/components/AdsRotator';
import { RecipeModal } from '@/components/basket/RecipeModal';
import { clsx } from 'clsx';

export default function BasketPage() {
  const { basket, totals, targets, isLoading, setBasket, setLoading } = useBasketStore();
  const [categories, setCategories] = useState<string[]>([]);
  const [excludedCats, setExcludedCats] = useState<string[]>([]);
  const [showPromo, setShowPromo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);
  const [forcePromo, setForcePromo] = useState<number[]>([]);
  const [veganMode, setVeganMode] = useState(false);

  useEffect(() => {
    if (veganMode) {
      basketApi.veganCategories().then(({ data }) => setCategories(data.categories));
    } else {
      basketApi.categories().then(({ data }) => setCategories(data.categories));
    }
  }, [veganMode]);

  const handleOptimize = async (formData: any) => {
    setLoading(true);
    try {
      const payload = {
        ...formData,
        excluded_categories: excludedCats,
        force_promo: forcePromo,
        vegan_only: veganMode,
      };
      const { data } = await basketApi.optimize(payload);
      setBasket(data.basket, data.totals, data.targets);
      toast.success(`კალათი გენერირდა! ✅ სულ: ${data.totals.price.toFixed(2)}₾`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.response?.data?.error || 'შეცდომა ოპტიმიზაციაში';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">ბიუჯეტური კალათი</h1>
          <p className="text-sm text-gray-500 mt-0.5">შეიყვანეთ კალორიები ან მაკროები — სისტემა გაგიჩენს ყველაზე იაფ კომბინაციას</p>
        </div>
        <div className="flex items-center gap-2">
          {/* ვეგანური ღილაკი */}
          <button
            onClick={() => {
              setVeganMode(!veganMode);
              setExcludedCats([]);
              toast.success(veganMode ? '🥩 ჩვეულებრივი რეჟიმი' : '🌱 ვეგანური რეჟიმი');
            }}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border',
              veganMode
                ? 'bg-green-500 text-white border-green-500 shadow-md'
                : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
            )}
          >
            <Leaf size={15} />
            <span className="hidden sm:inline">ვეგანური</span>
          </button>

          <button
            onClick={() => setShowFilter(!showFilter)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Filter size={15} />
            <span className="hidden sm:inline">ფილტრი</span>
            {excludedCats.length > 0 && (
              <span className="bg-primary-100 text-primary-700 text-xs px-1.5 py-0.5 rounded-full">
                -{excludedCats.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowPromo(true)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Gift size={15} />
            <span className="hidden sm:inline">პრომო</span>
          </button>
        </div>
      </div>

      {/* ვეგანური ბანერი */}
      {veganMode && (
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <Leaf size={16} className="text-green-600 shrink-0" />
          <span>🌱 ვეგანური რეჟიმი ჩართულია — მხოლოდ მცენარეული პროდუქტები</span>
        </div>
      )}

      {/* Category Filter */}
      {showFilter && (
        <CategoryFilter
          categories={categories}
          excluded={excludedCats}
          onChange={setExcludedCats}
        />
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Calculator */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
                <Calculator size={16} className="text-primary-600" />
              </div>
              <h2 className="font-semibold text-gray-900">კალკულატორი</h2>
            </div>
            <BasketCalculator onSubmit={handleOptimize} isLoading={isLoading} />
          </div>
          <AdsRotator />
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2">
          {basket.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={18} className="text-primary-600" />
                  <h2 className="font-semibold text-gray-900">კვების კალათი</h2>
                  <span className="tag bg-primary-50 text-primary-700">{basket.length} პროდუქტი</span>
                  {veganMode && (
                    <span className="tag bg-green-50 text-green-700 text-[10px]">🌱 ვეგანური</span>
                  )}
                </div>
                <button
                  onClick={() => setShowRecipe(true)}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <ChefHat size={15} />
                  <span className="hidden sm:inline">რეცეპტი</span>
                </button>
              </div>
              <BasketResults />
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                <ShoppingCart size={28} className="text-gray-300" />
              </div>
              <p className="text-gray-400 text-sm">
                შეიყვანეთ კალორიები ან მაკროები და დააჭირეთ<br />"კალათის გენერაცია"
              </p>
            </div>
          )}
        </div>
      </div>

      {showPromo && (
        <PromoPopup
          onClose={() => setShowPromo(false)}
          onSelect={(ids) => { setForcePromo(ids); setShowPromo(false); toast.success('პრომო პროდუქტები დამატებულია'); }}
        />
      )}

      {showRecipe && (
        <RecipeModal
          basket={basket}
          totals={totals}
          onClose={() => setShowRecipe(false)}
        />
      )}
    </div>
  );
}
