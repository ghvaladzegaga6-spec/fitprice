'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Brain, Loader2, Droplets, Utensils, Calendar, AlertTriangle,
         TrendingDown, TrendingUp, Minus, Activity, ShoppingCart,
         ChefHat, Filter, Leaf, CheckCircle, RefreshCw, Scale } from 'lucide-react';
import { api, basketApi } from '@/lib/api';
import { useBasketStore } from '@/store/basket.store';
import { useAuthStore } from '@/store/auth.store';
import { BasketResults } from '@/components/basket/BasketResults';
import { CategoryFilter } from '@/components/basket/CategoryFilter';
import { RecipeModal } from '@/components/basket/RecipeModal';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const ACTIVITY_LABELS: Record<string, string> = {
  low: 'დაბალი — ოფისი, თითქმის არ ვმოძრაობ',
  medium: 'საშუალო — 7-10 ათასი ნაბიჯი ან კვ. 2-3 ვარჯიში',
  high: 'მაღალი — ფიზიკური სამუშაო ან ყოველდღიური ვარჯიში',
};

const EATING_WINDOW_LABELS: Record<string, string> = {
  short: 'მოკლე (8 საათზე ნაკლები) — მაგ: 12:00–20:00',
  standard: 'სტანდარტული (8–12 საათი) — მაგ: 09:00–21:00',
  long: 'გრძელი (12 საათზე მეტი) — მაგ: 07:00–23:00',
};

const CARB_LABELS: Record<string, string> = {
  high: 'მხნედ ვარ, ენერგია მემატება',
  low: 'მადუნებს, მეძინება ან მალევე ისევ მშივდება',
  neutral: 'განსაკუთრებულ რეაქციას ვერ ვამჩნევ',
};

const HUNGER_LABELS: Record<string, string> = {
  morning: 'დილით, გაღვიძებისთანავე',
  evening: 'საღამოს, სამუშაო დღის შემდეგ',
  even: 'მთელი დღის განმავლობაში თანაბრად',
};

const GOAL_CONFIG = {
  lose: { label: 'წონის კლება', icon: TrendingDown, color: 'text-blue-600 bg-blue-50 border-blue-200', info: 'კვირაში 0.5–1% სხეულის მასა (მაქს 3კგ/თვე)' },
  gain: { label: 'წონის მომატება', icon: TrendingUp, color: 'text-green-600 bg-green-50 border-green-200', info: 'თვეში 1–1.5კგ (ნახევარი — კუნთი)' },
  maintain: { label: 'შენარჩუნება', icon: Minus, color: 'text-gray-600 bg-gray-50 border-gray-200', info: 'წონის მერყეობა ±1კგ ნორმალურია' },
};

export default function PersonalizationPage() {
  const { user } = useAuthStore();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [basketLoading, setBasketLoading] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [excludedCats, setExcludedCats] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [veganMode, setVeganMode] = useState(false);
  const [savedProfile, setSavedProfile] = useState<any>(null);
  const [checkinNeeded, setCheckinNeeded] = useState(false);
  const [block, setBlock] = useState(1); // 1, 2, 3

  const { basket, totals, setBasket, setLoading: setBaskLoading } = useBasketStore();

  const { register, handleSubmit, watch, setValue } = useForm<any>({
    defaultValues: {
      gender: 'male', activity_level: 'medium', goal: 'maintain',
      eating_window: 'standard', carb_sensitivity: 'neutral', hunger_peak: 'even',
    },
  });
  const goal = watch('goal');

  // check-in form
  const { register: regC, handleSubmit: handleC } = useForm<any>({
    defaultValues: { energy_level: 3, hunger_level: 3 },
  });

  // პროფილის ჩატვირთვა
  useEffect(() => {
    if (!user) { setProfileLoading(false); return; }
    api.get('/personalization/profile').then(({ data }) => {
      if (data.profile) {
        const p = data.profile;
        setSavedProfile(p);
        // ფორმის შევსება
        setValue('gender', p.gender);
        setValue('age', p.age);
        setValue('weight_kg', p.weight_kg);
        setValue('height_cm', p.height_cm);
        setValue('activity_level', p.activity_level);
        setValue('goal', p.goal);
        setValue('target_weight_kg', p.target_weight_kg);
        setValue('eating_window', p.eating_window);
        setValue('carb_sensitivity', p.carb_sensitivity);
        setValue('hunger_peak', p.hunger_peak);
        setVeganMode(p.vegan_mode);
      }
    }).catch(() => {}).finally(() => setProfileLoading(false));

    // check-in საჭიროა?
    api.get('/personalization/checkin/needed').then(({ data }) => {
      setCheckinNeeded(data.needed);
    }).catch(() => {});

    // კატეგორიები
    basketApi.categories().then(({ data }) => setCategories(data.categories));
  }, [user]);

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const payload = {
  gender: data.gender,
  age: Number(data.age),
  weight_kg: Number(data.weight_kg),
  height_cm: Number(data.height_cm),
  activity_level: data.activity_level === 'low' ? 'low'
    : data.activity_level === 'medium' ? 'medium'
    : 'high',
  goal: data.goal,
  target_weight_kg: data.target_weight_kg ? Number(data.target_weight_kg) : undefined,
  eating_window: data.eating_window,
  carb_sensitivity: data.carb_sensitivity,
  hunger_peak: data.hunger_peak,
};
      // თუ შესულია — შენახვა, თუ არა — მხოლოდ გათვლა
    const endpoint = '/nutrition/calculate';
      const { data: res } = await api.post(endpoint, payload);
      setResult(res);
      setSavedProfile({ ...payload, ...res });
      toast.success('გათვლა დასრულდა! ✅');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'შეცდომა');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBasket = async () => {
    if (!result) return;
    setBasketLoading(true);
    setBaskLoading(true);
    try {
      const { data } = await basketApi.optimize({
        mode: 'calories',
        calories: result.adjusted_calories,
        calorie_ratio: result.calorie_ratio || {
          protein: 0.30, fat: 0.30, carbs: 0.40,
        },
        excluded_categories: excludedCats,
        vegan_only: veganMode,
      });
      setBasket(data.basket, data.totals, data.targets);
      toast.success(`კალათი დაგენერირდა! სულ: ${data.totals.price.toFixed(2)}₾`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'კალათის შეცდომა');
    } finally {
      setBasketLoading(false);
      setBaskLoading(false);
    }
  };

  const onCheckin = async (data: any) => {
    setCheckinLoading(true);
    try {
      const { data: res } = await api.post('/personalization/checkin', {
        current_weight_kg: Number(data.current_weight_kg),
        energy_level: Number(data.energy_level),
        hunger_level: Number(data.hunger_level),
      });
      setShowCheckin(false);
      setCheckinNeeded(false);
      if (res.warning) toast.error(res.warning, { duration: 6000 });
      if (res.energy_note) toast(res.energy_note, { duration: 5000 });
      toast.success(`${res.adjustment_reason} ✅`);
      // კალორიების განახლება
      if (result) setResult({ ...result, adjusted_calories: res.new_calories });
    } catch (err: any) {
      toast.error('Check-in შეცდომა');
    } finally {
      setCheckinLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 size={28} className="animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">პერსონალიზაცია</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {savedProfile ? `პროფილი შენახულია · ${savedProfile.goal === 'lose' ? 'კლება' : savedProfile.goal === 'gain' ? 'მომატება' : 'შენარჩუნება'}` : 'შეავსე კითხვარი და მიიღე პერსონალური გეგმა'}
          </p>
        </div>
        {checkinNeeded && user && (
          <button
            onClick={() => setShowCheckin(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium animate-pulse"
          >
            <Scale size={15} />
            კვირეული check-in
          </button>
        )}
      </div>

      {/* კვირეული check-in modal */}
      {showCheckin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="card w-full max-w-sm shadow-2xl">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Scale size={18} className="text-primary-600" />
              კვირეული შემოწმება
            </h2>
            <form onSubmit={handleC(onCheckin)} className="space-y-4">
              <div>
                <label className="label">ახლანდელი წონა (კგ)</label>
                <input type="number" step="0.1" className="input" placeholder="მაგ: 78.5" {...regC('current_weight_kg', { required: true })} />
              </div>
              <div>
                <label className="label">ენერგიის დონე კვირის განმავლობაში</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(n => (
                    <label key={n} className="flex-1 cursor-pointer">
                      <input type="radio" value={n} {...regC('energy_level')} className="peer sr-only" />
                      <div className="text-center py-2 rounded-lg border text-sm transition-all peer-checked:bg-primary-50 peer-checked:border-primary-400 peer-checked:text-primary-700 border-gray-200 text-gray-500">
                        {n}
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>დაბალი</span><span>მაღალი</span>
                </div>
              </div>
              <div>
                <label className="label">შიმშილის დონე</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(n => (
                    <label key={n} className="flex-1 cursor-pointer">
                      <input type="radio" value={n} {...regC('hunger_level')} className="peer sr-only" />
                      <div className="text-center py-2 rounded-lg border text-sm transition-all peer-checked:bg-primary-50 peer-checked:border-primary-400 peer-checked:text-primary-700 border-gray-200 text-gray-500">
                        {n}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCheckin(false)} className="btn-secondary flex-1">გაუქმება</button>
                <button type="submit" disabled={checkinLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {checkinLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  შენახვა
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-accent-50 rounded-lg flex items-center justify-center">
                <Brain size={16} className="text-accent-600" />
              </div>
              <h2 className="font-semibold text-gray-900">კითხვარი</h2>
              {savedProfile && <span className="tag bg-green-50 text-green-700 text-xs">✅ შენახული</span>}
            </div>

            {/* Block tabs */}
            <div className="flex rounded-xl border border-gray-200 p-1 gap-1 mb-5">
              {[
                { n: 1, label: 'ბლოკი I' },
                { n: 2, label: 'ბლოკი II' },
                { n: 3, label: 'მიზანი' },
              ].map(({ n, label }) => (
                <button key={n} type="button" onClick={() => setBlock(n)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${block === n ? 'bg-primary-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* ბლოკი I */}
              {block === 1 && (
                <>
                  <div>
                    <label className="label">სქესი</label>
                    <div className="flex gap-2">
                      {[{ v: 'male', l: '👨 მამრობითი' }, { v: 'female', l: '👩 მდედრობითი' }].map(({ v, l }) => (
                        <label key={v} className="flex-1 cursor-pointer">
                          <input type="radio" value={v} {...register('gender')} className="peer sr-only" />
                          <div className="text-center py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium transition-all peer-checked:border-primary-400 peer-checked:bg-primary-50 peer-checked:text-primary-700 text-gray-600">
                            {l}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: 'age', label: 'ასაკი', placeholder: '30' },
                      { name: 'height_cm', label: 'სიმაღლე (სმ)', placeholder: '175' },
                      { name: 'weight_kg', label: 'წონა (კგ)', placeholder: '75' },
                    ].map(({ name, label, placeholder }) => (
                      <div key={name}>
                        <label className="label text-xs">{label}</label>
                        <input type="number" className="input text-sm py-2" placeholder={placeholder} {...register(name)} />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="label">ყოველდღიური აქტივობა</label>
                    <div className="space-y-2">
                      {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
                        <label key={v} className="cursor-pointer">
                          <input type="radio" value={v} {...register('activity_level')} className="peer sr-only" />
                          <div className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200">
                            <div className="w-4 h-4 rounded-full border-2 border-gray-300 peer-checked:border-primary-500 mt-0.5 shrink-0" />
                            <span className="text-gray-700">{l}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button type="button" onClick={() => setBlock(2)} className="btn-primary w-full">შემდეგი →</button>
                </>
              )}

              {/* ბლოკი II */}
              {block === 2 && (
                <>
                  <div>
                    <label className="label">კვების ფანჯარა</label>
                    <p className="text-xs text-gray-400 mb-2">დღის რა მონაკვეთში მიირთმევთ საკვებს?</p>
                    <div className="space-y-2">
                      {Object.entries(EATING_WINDOW_LABELS).map(([v, l]) => (
                        <label key={v} className="cursor-pointer">
                          <input type="radio" value={v} {...register('eating_window')} className="peer sr-only" />
                          <div className="p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200 text-gray-700">
                            {l}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">ნახშირწყლებისადმი მგრძნობელობა</label>
                    <p className="text-xs text-gray-400 mb-2">როგორ გრძნობთ თავს პურეულის მიღების შემდეგ?</p>
                    <div className="space-y-2">
                      {Object.entries(CARB_LABELS).map(([v, l]) => (
                        <label key={v} className="cursor-pointer">
                          <input type="radio" value={v} {...register('carb_sensitivity')} className="peer sr-only" />
                          <div className="p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200 text-gray-700">
                            {l}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">შიმშილის პიკი</label>
                    <p className="text-xs text-gray-400 mb-2">დღის რომელ მონაკვეთში გიჭირთ კვების კონტროლი?</p>
                    <div className="space-y-2">
                      {Object.entries(HUNGER_LABELS).map(([v, l]) => (
                        <label key={v} className="cursor-pointer">
                          <input type="radio" value={v} {...register('hunger_peak')} className="peer sr-only" />
                          <div className="p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200 text-gray-700">
                            {l}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setBlock(1)} className="btn-secondary flex-1">← უკან</button>
                    <button type="button" onClick={() => setBlock(3)} className="btn-primary flex-1">შემდეგი →</button>
                  </div>
                </>
              )}

              {/* ბლოკი III */}
              {block === 3 && (
                <>
                  <div>
                    <label className="label">მიზანი</label>
                    <div className="space-y-2">
                      {Object.entries(GOAL_CONFIG).map(([v, { label, icon: Icon, color, info }]) => (
                        <label key={v} className="cursor-pointer">
                          <input type="radio" value={v} {...register('goal')} className="peer sr-only" />
                          <div className={clsx('flex items-start gap-3 p-3 rounded-xl border transition-all peer-checked:ring-2 peer-checked:ring-primary-400', goal === v ? color : 'border-gray-100 hover:border-gray-200')}>
                            <Icon size={16} className="mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm font-medium">{label}</div>
                              <div className="text-xs text-gray-500 mt-0.5">{info}</div>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {(goal === 'lose' || goal === 'gain') && (
                    <div>
                      <label className="label">სამიზნე წონა (კგ) — სურვილისამებრ</label>
                      <input type="number" className="input text-sm" placeholder="მაგ: 70" {...register('target_weight_kg')} />
                    </div>
                  )}

                  {/* ვეგანური */}
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={veganMode} onChange={e => setVeganMode(e.target.checked)} className="w-4 h-4 accent-green-600" />
                    <div className="flex items-center gap-2">
                      <Leaf size={15} className="text-green-600" />
                      <span className="text-sm text-gray-700">ვეგანური კვება</span>
                    </div>
                  </label>

                  {!user && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800">
                      ⚠️ პროფილის შენახვისთვის საჭიროა შესვლა
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setBlock(2)} className="btn-secondary flex-1">← უკან</button>
                    <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                      {loading ? <><Loader2 size={15} className="animate-spin" /> გათვლა...</> : '🧮 გათვლა'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          {result ? (
            <>
              {result.warnings?.map((w: string, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">{w}</p>
                </div>
              ))}

              {/* Main Stats */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-primary-600" />
                  მეტაბოლური გათვლები
                  {savedProfile?.profile_code && (
                    <span className="tag bg-gray-100 text-gray-500 text-xs font-mono">{savedProfile.profile_code}</span>
                  )}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'BMR', val: result.bmr, unit: 'კკალ', desc: 'ძირითადი' },
                    { label: 'TDEE', val: result.tdee, unit: 'კკალ', desc: 'სულ ბრუნვა' },
                    { label: 'სამიზნე', val: result.adjusted_calories, unit: 'კკალ', desc: 'დღიური', highlight: true },
                    { label: 'BMI', val: result.bmi, unit: '', desc: result.bmi_class === 'ნორმა' ? '✅ ნორმა' : result.bmi_class },
                  ].map(({ label, val, unit, desc, highlight }) => (
                    <div key={label} className={clsx('rounded-xl p-3 text-center', highlight ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50')}>
                      <div className={clsx('font-bold text-xl', highlight ? 'text-primary-700' : 'text-gray-800')}>{val}{unit}</div>
                      <div className="text-xs font-medium text-gray-500">{label}</div>
                      <div className="text-[10px] text-gray-400">{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Macros */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">მაკროელემენტები (დღიური)</h3>
                <div className="space-y-3">
                  {[
                    { label: 'ცილა', val: result.macros?.protein, color: 'bg-blue-400', unit: 'გ' },
                    { label: 'ნახშირწყლები', val: result.macros?.carbs, color: 'bg-green-400', unit: 'გ' },
                    { label: 'ცხიმი', val: result.macros?.fat, color: 'bg-yellow-400', unit: 'გ' },
                  ].map(({ label, val, color, unit }) => {
                    if (!val) return null;
                    const total = (result.macros?.protein || 0) + (result.macros?.carbs || 0) + (result.macros?.fat || 0);
                    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{label}</span>
                          <span className="text-gray-500">{val}{unit} <span className="text-gray-400 text-xs">({pct}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Water + Timeline */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card text-center">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <Droplets size={20} className="text-blue-500" />
                  </div>
                  <div className="font-bold text-xl text-blue-600">{result.water_ml} მლ</div>
                  <div className="text-xs text-gray-400 mt-0.5">წყალი დღეში</div>
                </div>
                {result.timeline && (
                  <div className="card text-center">
                    <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                      <Calendar size={20} className="text-primary-500" />
                    </div>
                    <div className="font-bold text-lg text-primary-600">{result.timeline}</div>
                    <div className="text-xs text-gray-400 mt-0.5">სამიზნე დრო</div>
                    <div className="text-xs text-gray-500">{result.weekly_rate}</div>
                  </div>
                )}
              </div>

              {/* Meal Plan */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Utensils size={16} className="text-primary-600" />
                  კვებების განაწილება ({result.meals_per_day} კვება/დღე)
                </h3>
                <div className="space-y-2">
                  {result.meal_plan?.map((meal: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-16 text-xs text-gray-400 font-medium">{meal.time}</div>
                      <div className="flex-1">
                        <span className="font-medium text-sm text-gray-800">{meal.name}</span>
                        <div className="text-xs text-gray-400">{meal.ratio}% კალორიებიდან</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">{meal.calories} კკალ</span>
                        <span>ც:{meal.protein}გ</span>
                        <span>ცხ:{meal.fat}გ</span>
                        <span>ნ:{meal.carbs}გ</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* კალათის გენერაცია */}
              <div className="card border-2 border-primary-100 bg-primary-50/30">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <ShoppingCart size={16} className="text-primary-600" />
                  კალათის გენერაცია
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  სისტემა შეადგენს {result.adjusted_calories} კკალ-ის კალათს შენი პროფილის მიხედვით
                </p>

                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setVeganMode(!veganMode)}
                    className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                      veganMode ? 'bg-green-500 text-white border-green-500' : 'bg-white text-green-700 border-green-300')}
                  >
                    <Leaf size={12} />ვეგანური
                  </button>
                  <button
                    onClick={() => setShowFilter(!showFilter)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  >
                    <Filter size={12} />
                    ფილტრი {excludedCats.length > 0 && `(-${excludedCats.length})`}
                  </button>
                </div>

                {showFilter && (
                  <div className="mb-3">
                    <CategoryFilter categories={categories} excluded={excludedCats} onChange={setExcludedCats} />
                  </div>
                )}

                <button
                  onClick={handleGenerateBasket}
                  disabled={basketLoading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {basketLoading
                    ? <><Loader2 size={15} className="animate-spin" /> გენერაცია...</>
                    : <><ShoppingCart size={15} /> კალათის გენერაცია ({result.adjusted_calories} კკალ)</>}
                </button>
              </div>

              {/* კალათი */}
              {basket.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <ShoppingCart size={16} className="text-primary-600" />
                      კვების კალათი
                      <span className="tag bg-primary-50 text-primary-700">{basket.length} პროდუქტი</span>
                    </h3>
                    <button onClick={() => setShowRecipe(true)} className="btn-secondary flex items-center gap-2 text-sm">
                      <ChefHat size={15} />რეცეპტი
                    </button>
                  </div>
                  <BasketResults />
                </div>
              )}

              {showRecipe && (
                <RecipeModal basket={basket} totals={totals} onClose={() => setShowRecipe(false)} />
              )}
            </>
          ) : (
            <div className="card flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-accent-50 rounded-2xl flex items-center justify-center mb-4">
                <Brain size={28} className="text-accent-300" />
              </div>
              <p className="text-gray-400 text-sm">
                {savedProfile
                  ? 'პროფილი შენახულია. დააჭირე "გათვლა" განახლებული გეგმისთვის'
                  : 'შეავსე 3-ბლოკიანი კითხვარი და მიიღე პერსონალური გეგმა'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
