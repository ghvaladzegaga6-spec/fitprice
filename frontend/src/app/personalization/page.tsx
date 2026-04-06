'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Brain, Loader2, Droplets, Utensils, Calendar, AlertTriangle,
         TrendingDown, TrendingUp, Minus, Activity, ShoppingCart,
         ChefHat, Filter, Leaf, CheckCircle, Scale, Building2, LogIn, Lock } from 'lucide-react';
import { api, basketApi } from '@/lib/api';
import { useBasketStore } from '@/store/basket.store';
import { useAuthStore } from '@/store/auth.store';
import { BasketResults } from '@/components/basket/BasketResults';
import { CategoryFilter } from '@/components/basket/CategoryFilter';
import { RecipeModal } from '@/components/basket/RecipeModal';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import Link from 'next/link';

const ACTIVITY_LABELS: Record<string, string> = {
  low:    'დაბალი — ოფისი, თითქმის არ მოძრაობ',
  medium: 'საშუალო — 7-10 ათასი ნაბიჯი ან კვირაში 2-3 ვარჯიში',
  high:   'მაღალი — ფიზიკური შრომა ან ყოველდღიური ვარჯიში',
};
const EATING_WINDOW_LABELS: Record<string, string> = {
  short:    'მოკლე (8 საათამდე) — მაგ. 12:00-20:00',
  standard: 'სტანდარტული (8-12 სთ) — მაგ. 09:00-21:00',
  long:     'გრძელი (12+ სთ) — მაგ. 07:00-23:00',
};
const CARB_LABELS: Record<string, string> = {
  high:    'კარგი ენერგია — ნახშირწყლების შემდეგ კარგად ვგრძნობ თავს',
  low:     'სწრაფად მშია — ნახშირწყლების შემდეგ მალე კვლავ მშია',
  neutral: 'შეუმჩნეველი — განსაკუთრებული რეაქცია არ მაქვს',
};
const HUNGER_LABELS: Record<string, string> = {
  morning: 'დილით — გაღვიძებისთანავე',
  evening: 'საღამოს — სამსახურის შემდეგ',
  even:    'თანაბრად — მთელი დღის განმავლობაში',
};
const GOAL_CONFIG = {
  lose:     { label: 'წონის კლება',       icon: TrendingDown, color: 'text-blue-600 bg-blue-50 border-blue-200',  info: 'კვირაში სხეულის წონის 0.5-1%' },
  gain:     { label: 'წონის მომატება',    icon: TrendingUp,   color: 'text-green-600 bg-green-50 border-green-200', info: 'თვეში 1-1.5 კგ (ნახევარი კუნთი)' },
  maintain: { label: 'წონის შენარჩუნება', icon: Minus,        color: 'text-gray-600 bg-gray-50 border-gray-200',   info: '+/-1 კგ ვარიაცია ნორმალურია' },
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
  const [block, setBlock] = useState(1);
  const [gyms, setGyms] = useState<any[]>([]);
  const [isSuspended, setIsSuspended] = useState(false);

  const { basket, totals, setBasket, setLoading: setBaskLoading } = useBasketStore();
  const { register, handleSubmit, watch, setValue } = useForm<any>({
    defaultValues: {
      gender: 'male', activity_level: 'medium', goal: 'maintain',
      eating_window: 'standard', carb_sensitivity: 'neutral', hunger_peak: 'even',
    },
  });
  const goal = watch('goal');
  const { register: regC, handleSubmit: handleC } = useForm<any>({
    defaultValues: { energy_level: 3, hunger_level: 3 },
  });

  useEffect(() => {
    api.get('/admin/gyms/public').then(({ data }) => setGyms(data.gyms)).catch(() => {});
    if (veganMode) {
      basketApi.veganCategories().then(({ data }) => setCategories(data.categories)).catch(() => {});
    } else {
      basketApi.categories().then(({ data }) => setCategories(data.categories)).catch(() => {});
    }
    if (!user) { setProfileLoading(false); return; }

    api.get('/auth/me').then(({ data }) => {
      setIsSuspended(data.user?.is_suspended || false);
    }).catch(() => {});

    api.get('/personalization/profile').then(({ data }) => {
      if (data.profile) {
        const p = data.profile;
        setSavedProfile(p);
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
        if (p.quiz_completed) loadDailyPlan();
      }
    }).catch(() => {}).finally(() => setProfileLoading(false));

    api.get('/personalization/checkin/needed').then(({ data }) => {
      setCheckinNeeded(data.needed);
    }).catch(() => {});
  }, [user, veganMode]);

  const loadDailyPlan = async () => {
    try {
      const { data } = await api.get('/personalization/daily-plan');
      if (data.plan) {
        setResult({
          adjusted_calories: data.plan.total_calories,
          macros: { protein: data.plan.total_protein, fat: data.plan.total_fat, carbs: data.plan.total_carbs },
          meal_plan: data.plan.meals,
          meals_per_day: data.plan.meals?.length || 3,
          water_ml: Math.round((savedProfile?.weight_kg || 70) * 35),
        });
      }
    } catch {}
  };

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const payload = {
        gender: data.gender, age: Number(data.age),
        weight_kg: Number(data.weight_kg), height_cm: Number(data.height_cm),
        activity_level: data.activity_level, goal: data.goal,
        target_weight_kg: data.target_weight_kg ? Number(data.target_weight_kg) : undefined,
        eating_window: data.eating_window, carb_sensitivity: data.carb_sensitivity,
        hunger_peak: data.hunger_peak,
        calorie_multiplier: savedProfile?.calorie_multiplier || 1.0,
        vegan_mode: veganMode,
      };
      const { data: res } = await api.post('/personalization/calculate', payload);
      setResult(res);
      setSavedProfile({ ...payload, ...res, quiz_completed: true });
      toast.success('გათვლა დასრულდა! ✅');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'შეცდომა');
    } finally { setLoading(false); }
  };

  const handleGenerateBasket = async () => {
    if (!result) return;
    setBasketLoading(true); setBaskLoading(true);
    try {
      const { data } = await basketApi.optimize({
        mode: 'calories',
        calories: result.adjusted_calories,
        calorie_ratio: result.calorie_ratio || { protein: 0.30, fat: 0.30, carbs: 0.40 },
        excluded_categories: excludedCats,
        vegan_only: veganMode,
        gym_only: true,
      });
      setBasket(data.basket, data.totals, data.targets);
      toast.success(`კალათი მზადაა! სულ: ${data.totals.price.toFixed(2)} ₾`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'კალათის შეცდომა');
    } finally { setBasketLoading(false); setBaskLoading(false); }
  };

  const onCheckin = async (data: any) => {
    setCheckinLoading(true);
    try {
      const { data: res } = await api.post('/personalization/checkin', {
        current_weight_kg: Number(data.current_weight_kg),
        energy_level: Number(data.energy_level),
        hunger_level: Number(data.hunger_level),
      });
      setShowCheckin(false); setCheckinNeeded(false);
      if (res.warning) toast.error(res.warning, { duration: 6000 });
      if (res.energy_note) toast(res.energy_note, { duration: 5000 });
      toast.success(res.adjustment_reason + ' ✅');
      if (result) setResult({ ...result, adjusted_calories: res.new_calories });
    } catch { toast.error('Check-in შეცდომა'); }
    finally { setCheckinLoading(false); }
  };

  if (profileLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 size={28} className="animate-spin text-primary-500" />
      </div>
    );
  }

  // შეჩერებული მომხმარებელი
  if (user && isSuspended) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
          <Lock size={32} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">წვდომა შეჩერებულია</h2>
        <p className="text-gray-500 text-sm max-w-sm">
          თქვენი წვდომა დროებით შეჩერებულია. განაახლეთ დარბაზის გაწევრიანება და დაუკავშირდით ადმინისტრატორს.
        </p>
      </div>
    );
  }

  // არ არის შესული
  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        {/* ლამაზი ბექგრაუნდი */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-accent-500 to-primary-800 opacity-10 pointer-events-none" />
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none" />

        <div className="relative space-y-8 py-6 px-4 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-accent-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
              <Brain size={40} className="text-white" />
            </div>
            <h2 className="text-3xl font-display font-bold text-gray-900 mb-3">
              პერსონალიზაციის სერვისი
            </h2>
            <p className="text-gray-500 text-base max-w-md mx-auto leading-relaxed">
              ამ სერვისით სარგებლობისთვის აუცილებელია იყოთ
              <strong> FITPRICE-თან</strong> თანამშრომელი დარბაზის წევრი.
              შედით სისტემაში ან დაუკავშირდით თქვენი დარბაზის ადმინისტრატორს.
            </p>
            <Link href="/auth/login" className="btn-primary inline-flex items-center gap-2 mt-6 px-8 py-3 text-base">
              <LogIn size={18} /> სისტემაში შესვლა
            </Link>
          </div>

          {gyms.length > 0 && (
            <div>
              <h3 className="text-center font-semibold text-gray-700 mb-5 text-lg">
                🏋️ ჩვენი პარტნიორი დარბაზები
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {gyms.map(gym => (
                  <div key={gym.id} className="card hover:shadow-lg transition-all hover:-translate-y-1">
                    {gym.photo_url ? (
                      <img src={gym.photo_url} alt={gym.name} className="w-full h-40 object-cover rounded-xl mb-3" />
                    ) : (
                      <div className="w-full h-40 bg-gradient-to-br from-primary-100 to-accent-100 rounded-xl mb-3 flex items-center justify-center">
                        {gym.logo_url
                          ? <img src={gym.logo_url} alt={gym.name} className="h-16 object-contain" />
                          : <Building2 size={40} className="text-primary-300" />}
                      </div>
                    )}
                    <h4 className="font-semibold text-gray-900">{gym.name}</h4>
                    {gym.address && <p className="text-xs text-gray-500 mt-1">📍 {gym.address}</p>}
                    {gym.description && <p className="text-xs text-gray-400 mt-2">{gym.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const profileCompleted = savedProfile?.quiz_completed;

  return (
    <div className="relative min-h-screen">
      {/* ბექგრაუნდი */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-400 rounded-full mix-blend-multiply filter blur-3xl opacity-5" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent-400 rounded-full mix-blend-multiply filter blur-3xl opacity-5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-5" />
      </div>

      <div className="space-y-6 animate-in relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">პერსონალიზაცია</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {profileCompleted
                ? `პროფილი შენახულია · ${savedProfile?.goal === 'lose' ? 'წონის კლება' : savedProfile?.goal === 'gain' ? 'წონის მომატება' : 'შენარჩუნება'}`
                : 'შეავსე კითხვარი პერსონალური გეგმის მისაღებად'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {profileCompleted && (
              <Link href="/profile" className="btn-secondary text-sm flex items-center gap-1">
                პროფილის განახლება
              </Link>
            )}
            {checkinNeeded && (
              <button onClick={() => setShowCheckin(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium animate-pulse">
                <Scale size={15} /> ყოველკვირეული შემოწმება
              </button>
            )}
          </div>
        </div>

        {/* Check-in modal */}
        {showCheckin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="card w-full max-w-sm shadow-2xl">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Scale size={18} className="text-primary-600" /> ყოველკვირეული შემოწმება
              </h2>
              <form onSubmit={handleC(onCheckin)} className="space-y-4">
                <div>
                  <label className="label">მიმდინარე წონა (კგ)</label>
                  <input type="number" step="0.1" className="input" placeholder="მაგ. 78.5"
                    {...regC('current_weight_kg', { required: true })} />
                </div>
                <div>
                  <label className="label">ენერგიის დონე ამ კვირას</label>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(n => (
                      <label key={n} className="flex-1 cursor-pointer">
                        <input type="radio" value={n} {...regC('energy_level')} className="peer sr-only" />
                        <div className="text-center py-2 rounded-lg border text-sm transition-all peer-checked:bg-primary-50 peer-checked:border-primary-400 peer-checked:text-primary-700 border-gray-200 text-gray-500">{n}</div>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>დაბალი</span><span>მაღალი</span></div>
                </div>
                <div>
                  <label className="label">შიმშილის დონე</label>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(n => (
                      <label key={n} className="flex-1 cursor-pointer">
                        <input type="radio" value={n} {...regC('hunger_level')} className="peer sr-only" />
                        <div className="text-center py-2 rounded-lg border text-sm transition-all peer-checked:bg-primary-50 peer-checked:border-primary-400 peer-checked:text-primary-700 border-gray-200 text-gray-500">{n}</div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowCheckin(false)} className="btn-secondary flex-1">გაუქმება</button>
                  <button type="submit" disabled={checkinLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {checkinLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} შენახვა
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* კითხვარი — მხოლოდ თუ პროფილი არ არის შევსებული */}
          {!profileCompleted && (
            <div className="lg:col-span-2">
              <div className="card bg-white/80 backdrop-blur border border-white/50 shadow-xl">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 bg-gradient-to-br from-accent-500 to-primary-500 rounded-lg flex items-center justify-center shadow">
                    <Brain size={16} className="text-white" />
                  </div>
                  <h2 className="font-semibold text-gray-900">კითხვარი</h2>
                </div>

                {/* ბლოკების ნავიგაცია */}
                <div className="flex rounded-xl border border-gray-200 p-1 gap-1 mb-5">
                  {[{ n:1, label:'ბლოკი I' },{ n:2, label:'ბლოკი II' },{ n:3, label:'მიზანი' }].map(({ n, label }) => (
                    <button key={n} type="button" onClick={() => setBlock(n)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${block === n ? 'bg-primary-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  {block === 1 && (
                    <>
                      <div>
                        <label className="label">სქესი</label>
                        <div className="flex gap-2">
                          {[{ v:'male',l:'მამრობითი' },{ v:'female',l:'მდედრობითი' }].map(({ v, l }) => (
                            <label key={v} className="flex-1 cursor-pointer">
                              <input type="radio" value={v} {...register('gender')} className="peer sr-only" />
                              <div className="text-center py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium transition-all peer-checked:border-primary-400 peer-checked:bg-primary-50 peer-checked:text-primary-700 text-gray-600">{l}</div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {[{ name:'age',label:'ასაკი',placeholder:'30' },{ name:'height_cm',label:'სიმაღლე (სმ)',placeholder:'175' },{ name:'weight_kg',label:'წონა (კგ)',placeholder:'75' }].map(({ name, label, placeholder }) => (
                          <div key={name}>
                            <label className="label text-xs">{label}</label>
                            <input type="number" className="input text-sm py-2" placeholder={placeholder} {...register(name)} />
                          </div>
                        ))}
                      </div>
                      <div>
                        <label className="label">დღიური აქტივობა</label>
                        <div className="space-y-2">
                          {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
                            <label key={v} className="cursor-pointer">
                              <input type="radio" value={v} {...register('activity_level')} className="peer sr-only" />
                              <div className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200 text-gray-700">{l}</div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <button type="button" onClick={() => setBlock(2)} className="btn-primary w-full">შემდეგი →</button>
                    </>
                  )}
                  {block === 2 && (
                    <>
                      <div>
                        <label className="label">კვების ფანჯარა</label>
                        <div className="space-y-2">
                          {Object.entries(EATING_WINDOW_LABELS).map(([v, l]) => (
                            <label key={v} className="cursor-pointer">
                              <input type="radio" value={v} {...register('eating_window')} className="peer sr-only" />
                              <div className="p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200 text-gray-700">{l}</div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="label">ნახშირწყლების მგრძნობელობა</label>
                        <div className="space-y-2">
                          {Object.entries(CARB_LABELS).map(([v, l]) => (
                            <label key={v} className="cursor-pointer">
                              <input type="radio" value={v} {...register('carb_sensitivity')} className="peer sr-only" />
                              <div className="p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200 text-gray-700">{l}</div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="label">შიმშილის პიკი</label>
                        <div className="space-y-2">
                          {Object.entries(HUNGER_LABELS).map(([v, l]) => (
                            <label key={v} className="cursor-pointer">
                              <input type="radio" value={v} {...register('hunger_peak')} className="peer sr-only" />
                              <div className="p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200 text-gray-700">{l}</div>
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
                          <input type="number" className="input text-sm" placeholder="მაგ. 70" {...register('target_weight_kg')} />
                        </div>
                      )}
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={veganMode} onChange={e => setVeganMode(e.target.checked)} className="w-4 h-4 accent-green-600" />
                        <div className="flex items-center gap-2">
                          <Leaf size={15} className="text-green-600" />
                          <span className="text-sm text-gray-700">ვეგანური დიეტა</span>
                        </div>
                      </label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setBlock(2)} className="btn-secondary flex-1">← უკან</button>
                        <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                          {loading ? <><Loader2 size={15} className="animate-spin" /> გამოთვლა...</> : 'გამოთვლა'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* შედეგები */}
          <div className={clsx('space-y-4', profileCompleted ? 'lg:col-span-5' : 'lg:col-span-3')}>
            {result ? (
              <>
                {result.warnings?.map((w: string, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-800">{w}</p>
                  </div>
                ))}

                {/* მეტაბოლური გათვლები */}
                <div className="card bg-white/80 backdrop-blur border border-white/50 shadow-lg">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Activity size={16} className="text-primary-600" /> მეტაბოლური გათვლები
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'BMR', val: result.bmr, unit: 'კკალ', desc: 'საბაზო მაჩვენებელი' },
                      { label: 'TDEE', val: result.tdee, unit: 'კკალ', desc: 'სულ იწვება' },
                      { label: 'სამიზნე', val: result.adjusted_calories, unit: 'კკალ', desc: 'დღიური', highlight: true },
                      { label: 'BMI', val: result.bmi, unit: '', desc: result.bmi_class || 'ნორმა' },
                    ].map(({ label, val, unit, desc, highlight }) => (
                      <div key={label} className={clsx('rounded-xl p-3 text-center', highlight ? 'bg-primary-50 border-2 border-primary-200' : 'bg-gray-50')}>
                        <div className={clsx('font-bold text-xl', highlight ? 'text-primary-700' : 'text-gray-800')}>{val}{unit}</div>
                        <div className="text-xs font-medium text-gray-500">{label}</div>
                        <div className="text-[10px] text-gray-400">{desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* მაკრო ელემენტები */}
                <div className="card bg-white/80 backdrop-blur border border-white/50 shadow-lg">
                  <h3 className="font-semibold text-gray-900 mb-4">მაკრო ელემენტები (დღიური)</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'ცილა', val: result.macros?.protein, color: 'bg-blue-400', unit: 'გ' },
                      { label: 'ნახშირწყლები', val: result.macros?.carbs, color: 'bg-green-400', unit: 'გ' },
                      { label: 'ცხიმი', val: result.macros?.fat, color: 'bg-yellow-400', unit: 'გ' },
                    ].map(({ label, val, color, unit }) => {
                      if (!val) return null;
                      const total = (result.macros?.protein||0)+(result.macros?.carbs||0)+(result.macros?.fat||0);
                      const pct = total > 0 ? Math.round((val/total)*100) : 0;
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-700">{label}</span>
                            <span className="text-gray-500">{val}{unit} <span className="text-gray-400 text-xs">({pct}%)</span></span>
                          </div>
                          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width:`${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* წყალი და ვადა */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="card bg-white/80 backdrop-blur border border-white/50 shadow-lg text-center">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                      <Droplets size={20} className="text-blue-500" />
                    </div>
                    <div className="font-bold text-xl text-blue-600">{result.water_ml} მლ</div>
                    <div className="text-xs text-gray-400 mt-0.5">წყალი დღეში</div>
                  </div>
                  {result.timeline && (
                    <div className="card bg-white/80 backdrop-blur border border-white/50 shadow-lg text-center">
                      <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                        <Calendar size={20} className="text-primary-500" />
                      </div>
                      <div className="font-bold text-lg text-primary-600">{result.timeline}</div>
                      <div className="text-xs text-gray-400 mt-0.5">სამიზნე ვადა</div>
                      {result.weekly_rate && <div className="text-xs text-gray-500">{result.weekly_rate}</div>}
                    </div>
                  )}
                </div>

                {/* კვების გეგმა */}
                {result.meal_plan && (
                  <div className="card bg-white/80 backdrop-blur border border-white/50 shadow-lg">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Utensils size={16} className="text-primary-600" /> კვების გეგმა ({result.meals_per_day} კვება/დღე)
                    </h3>
                    <div className="space-y-2">
                      {result.meal_plan.map((meal: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
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
                )}

                {/* კალათის გენერაცია */}
                <div className="card bg-gradient-to-br from-primary-50 to-accent-50 border-2 border-primary-100 shadow-lg">
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <ShoppingCart size={16} className="text-primary-600" /> კალათის გენერაცია
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    სისტემა შექმნის {result.adjusted_calories} კკალ კალათს შენი პროფილის მიხედვით
                  </p>
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setVeganMode(!veganMode)}
                      className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all', veganMode ? 'bg-green-500 text-white border-green-500' : 'bg-white text-green-700 border-green-300')}>
                      <Leaf size={12} /> ვეგანური
                    </button>
                    <button onClick={() => setShowFilter(!showFilter)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:bg-gray-50">
                      <Filter size={12} /> ფილტრი {excludedCats.length > 0 && `(-${excludedCats.length})`}
                    </button>
                  </div>
                  {showFilter && (
                    <div className="mb-3">
                      <CategoryFilter categories={categories} excluded={excludedCats} onChange={setExcludedCats} />
                    </div>
                  )}
                  <button onClick={handleGenerateBasket} disabled={basketLoading}
                    className="btn-primary w-full flex items-center justify-center gap-2">
                    {basketLoading
                      ? <><Loader2 size={15} className="animate-spin" /> მუშავდება...</>
                      : <><ShoppingCart size={15} /> კალათის გენერაცია ({result.adjusted_calories} კკალ)</>}
                  </button>
                </div>

                {/* კალათი */}
                {basket.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <ShoppingCart size={16} className="text-primary-600" /> კვების კალათი
                        <span className="tag bg-primary-50 text-primary-700">{basket.length} პროდუქტი</span>
                      </h3>
                      <button onClick={() => setShowRecipe(true)} className="btn-secondary flex items-center gap-2 text-sm">
                        <ChefHat size={15} /> AI რეცეპტი
                      </button>
                    </div>
                    <BasketResults />
                  </div>
                )}
                {showRecipe && <RecipeModal basket={basket} totals={totals} onClose={() => setShowRecipe(false)} />}
              </>
            ) : (
              <div className="card bg-white/80 backdrop-blur border border-white/50 shadow-lg flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-accent-100 to-primary-100 rounded-2xl flex items-center justify-center mb-4">
                  <Brain size={28} className="text-accent-400" />
                </div>
                <p className="text-gray-400 text-sm">
                  {savedProfile ? 'პროფილი შენახულია. ტვირთავს შენს გეგმას...' : 'შეავსე 3-ბლოკიანი კითხვარი პერსონალური გეგმის მისაღებად'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
