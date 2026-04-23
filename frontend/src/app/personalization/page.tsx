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
  low: 'Low — office, almost no movement',
  medium: 'Medium — 7-10k steps or 2-3 workouts/week',
  high: 'High — physical work or daily training',
};
const EATING_WINDOW_LABELS: Record<string, string> = {
  short: 'Short (under 8h) — e.g. 12:00-20:00',
  standard: 'Standard (8-12h) — e.g. 09:00-21:00',
  long: 'Long (12h+) — e.g. 07:00-23:00',
};
const CARB_LABELS: Record<string, string> = {
  high: 'Energized, feel great after carbs',
  low: 'Tired or hungry again soon after',
  neutral: 'No noticeable reaction',
};
const HUNGER_LABELS: Record<string, string> = {
  morning: 'Morning, right after waking up',
  evening: 'Evening, after work',
  even: 'Evenly throughout the day',
};
const GOAL_CONFIG = {
  lose: { label: 'Weight Loss', icon: TrendingDown, color: 'text-blue-600 bg-blue-50 border-blue-200', info: '0.5-1% body weight per week' },
  gain: { label: 'Weight Gain', icon: TrendingUp, color: 'text-green-600 bg-green-50 border-green-200', info: '1-1.5kg per month (half muscle)' },
  maintain: { label: 'Maintain', icon: Minus, color: 'text-gray-600 bg-gray-50 border-gray-200', info: 'Weight variation of +/-1kg is normal' },
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
    // always load gyms for public display
    api.get('/admin/gyms/public').then(({ data }) => setGyms(data.gyms)).catch(() => {});
    basketApi.categories().then(({ data }) => setCategories(data.categories)).catch(() => {});

    if (!user) { setProfileLoading(false); return; }

    // check if suspended
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

        // if profile exists, auto-load daily plan
        if (p.quiz_completed) {
          loadDailyPlan();
        }
      }
    }).catch(() => {}).finally(() => setProfileLoading(false));

    api.get('/personalization/checkin/needed').then(({ data }) => {
      setCheckinNeeded(data.needed);
    }).catch(() => {});
  }, [user]);

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
        gender: data.gender,
        age: Number(data.age),
        weight_kg: Number(data.weight_kg),
        height_cm: Number(data.height_cm),
        activity_level: data.activity_level,
        goal: data.goal,
        target_weight_kg: data.target_weight_kg ? Number(data.target_weight_kg) : undefined,
        eating_window: data.eating_window,
        carb_sensitivity: data.carb_sensitivity,
        hunger_peak: data.hunger_peak,
        calorie_multiplier: savedProfile?.calorie_multiplier || 1.0,
        vegan_mode: veganMode,
      };
      const { data: res } = await api.post('/personalization/calculate', payload);
      setResult(res);
      setSavedProfile({ ...payload, ...res, quiz_completed: true });
      toast.success('Calculation complete!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Error');
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
        calorie_ratio: result.calorie_ratio || { protein: 0.30, fat: 0.30, carbs: 0.40 },
        excluded_categories: excludedCats,
        vegan_only: veganMode,
      });
      setBasket(data.basket, data.totals, data.targets);
      toast.success(`Basket ready! Total: ${data.totals.price.toFixed(2)} GEL`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Basket error');
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
      toast.success(res.adjustment_reason + ' ✅');
      if (result) setResult({ ...result, adjusted_calories: res.new_calories });
    } catch {
      toast.error('Check-in error');
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

  // Suspended user
  if (user && isSuspended) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
          <Lock size={32} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Suspended</h2>
        <p className="text-gray-500 text-sm max-w-sm">
          Your access has been temporarily suspended. Please renew your gym membership and contact the administrator.
        </p>
      </div>
    );
  }

  // Not logged in — show gym list
  if (!user) {
    return (
      <div className="space-y-8 py-6 px-4 max-w-4xl mx-auto">
        <div className="text-center">
          <div className="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock size={32} className="text-primary-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Personalization Service</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            To access this service, you must be a member of a gym that partners with <strong>FITPRICE</strong>.
            Sign in with your account or contact your gym administrator.
          </p>
          <Link href="/auth/login" className="btn-primary inline-flex items-center gap-2 mt-6">
            <LogIn size={16} /> Sign In
          </Link>
        </div>

        {gyms.length > 0 && (
          <div>
            <h3 className="text-center font-semibold text-gray-700 mb-5 text-lg">Our Partner Gyms</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {gyms.map(gym => (
                <div key={gym.id} className="card hover:shadow-md transition-shadow">
                  {gym.photo_url ? (
                    <img src={gym.photo_url} alt={gym.name} className="w-full h-40 object-cover rounded-xl mb-3" />
                  ) : (
                    <div className="w-full h-40 bg-gradient-to-br from-primary-100 to-accent-100 rounded-xl mb-3 flex items-center justify-center">
                      {gym.logo_url ? (
                        <img src={gym.logo_url} alt={gym.name} className="h-16 object-contain" />
                      ) : (
                        <Building2 size={40} className="text-primary-300" />
                      )}
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
    );
  }

  // Logged in user — show personalization
  // If profile already saved, show results directly
  const profileCompleted = savedProfile?.quiz_completed;

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Personalization</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {profileCompleted
              ? `Profile saved · ${savedProfile?.goal === 'lose' ? 'Weight Loss' : savedProfile?.goal === 'gain' ? 'Weight Gain' : 'Maintenance'}`
              : 'Fill in the questionnaire to get your personal plan'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profileCompleted && (
            <Link href="/profile" className="btn-secondary text-sm flex items-center gap-1">
              Update Profile
            </Link>
          )}
          {checkinNeeded && (
            <button onClick={() => setShowCheckin(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium animate-pulse">
              <Scale size={15} /> Weekly Check-in
            </button>
          )}
        </div>
      </div>

      {showCheckin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="card w-full max-w-sm shadow-2xl">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Scale size={18} className="text-primary-600" /> Weekly Check
            </h2>
            <form onSubmit={handleC(onCheckin)} className="space-y-4">
              <div>
                <label className="label">Current weight (kg)</label>
                <input type="number" step="0.1" className="input" placeholder="e.g. 78.5"
                  {...regC('current_weight_kg', { required: true })} />
              </div>
              <div>
                <label className="label">Energy level this week</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(n => (
                    <label key={n} className="flex-1 cursor-pointer">
                      <input type="radio" value={n} {...regC('energy_level')} className="peer sr-only" />
                      <div className="text-center py-2 rounded-lg border text-sm transition-all peer-checked:bg-primary-50 peer-checked:border-primary-400 peer-checked:text-primary-700 border-gray-200 text-gray-500">{n}</div>
                    </label>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1"><span>Low</span><span>High</span></div>
              </div>
              <div>
                <label className="label">Hunger level</label>
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
                <button type="button" onClick={() => setShowCheckin(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={checkinLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {checkinLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {!profileCompleted && (
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-accent-50 rounded-lg flex items-center justify-center">
                  <Brain size={16} className="text-accent-600" />
                </div>
                <h2 className="font-semibold text-gray-900">Questionnaire</h2>
              </div>
              <div className="flex rounded-xl border border-gray-200 p-1 gap-1 mb-5">
                {[{ n: 1, label: 'Block I' }, { n: 2, label: 'Block II' }, { n: 3, label: 'Goal' }].map(({ n, label }) => (
                  <button key={n} type="button" onClick={() => setBlock(n)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${block === n ? 'bg-primary-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {block === 1 && (
                  <>
                    <div>
                      <label className="label">Gender</label>
                      <div className="flex gap-2">
                        {[{ v: 'male', l: 'Male' }, { v: 'female', l: 'Female' }].map(({ v, l }) => (
                          <label key={v} className="flex-1 cursor-pointer">
                            <input type="radio" value={v} {...register('gender')} className="peer sr-only" />
                            <div className="text-center py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium transition-all peer-checked:border-primary-400 peer-checked:bg-primary-50 peer-checked:text-primary-700 text-gray-600">{l}</div>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[{ name: 'age', label: 'Age', placeholder: '30' }, { name: 'height_cm', label: 'Height (cm)', placeholder: '175' }, { name: 'weight_kg', label: 'Weight (kg)', placeholder: '75' }].map(({ name, label, placeholder }) => (
                        <div key={name}>
                          <label className="label text-xs">{label}</label>
                          <input type="number" className="input text-sm py-2" placeholder={placeholder} {...register(name)} />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="label">Daily activity</label>
                      <div className="space-y-2">
                        {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
                          <label key={v} className="cursor-pointer">
                            <input type="radio" value={v} {...register('activity_level')} className="peer sr-only" />
                            <div className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200">
                              <span className="text-gray-700">{l}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                    <button type="button" onClick={() => setBlock(2)} className="btn-primary w-full">Next →</button>
                  </>
                )}
                {block === 2 && (
                  <>
                    <div>
                      <label className="label">Eating window</label>
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
                      <label className="label">Carb sensitivity</label>
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
                      <label className="label">Hunger peak</label>
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
                      <button type="button" onClick={() => setBlock(1)} className="btn-secondary flex-1">← Back</button>
                      <button type="button" onClick={() => setBlock(3)} className="btn-primary flex-1">Next →</button>
                    </div>
                  </>
                )}
                {block === 3 && (
                  <>
                    <div>
                      <label className="label">Goal</label>
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
                        <label className="label">Target weight (kg) — optional</label>
                        <input type="number" className="input text-sm" placeholder="e.g. 70" {...register('target_weight_kg')} />
                      </div>
                    )}
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={veganMode} onChange={e => setVeganMode(e.target.checked)} className="w-4 h-4 accent-green-600" />
                      <div className="flex items-center gap-2">
                        <Leaf size={15} className="text-green-600" />
                        <span className="text-sm text-gray-700">Vegan diet</span>
                      </div>
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setBlock(2)} className="btn-secondary flex-1">← Back</button>
                      <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                        {loading ? <><Loader2 size={15} className="animate-spin" /> Calculating...</> : 'Calculate'}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>
          </div>
        )}

        <div className={clsx('space-y-4', profileCompleted ? 'lg:col-span-5' : 'lg:col-span-3')}>
          {result ? (
            <>
              {result.warnings?.map((w: string, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">{w}</p>
                </div>
              ))}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-primary-600" /> Metabolic Calculations
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'BMR', val: result.bmr, unit: 'kcal', desc: 'Base rate' },
                    { label: 'TDEE', val: result.tdee, unit: 'kcal', desc: 'Total burn' },
                    { label: 'Target', val: result.adjusted_calories, unit: 'kcal', desc: 'Daily', highlight: true },
                    { label: 'BMI', val: result.bmi, unit: '', desc: result.bmi_class || 'Normal' },
                  ].map(({ label, val, unit, desc, highlight }) => (
                    <div key={label} className={clsx('rounded-xl p-3 text-center', highlight ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50')}>
                      <div className={clsx('font-bold text-xl', highlight ? 'text-primary-700' : 'text-gray-800')}>{val}{unit}</div>
                      <div className="text-xs font-medium text-gray-500">{label}</div>
                      <div className="text-[10px] text-gray-400">{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">Macronutrients (daily)</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Protein', val: result.macros?.protein, color: 'bg-blue-400', unit: 'g' },
                    { label: 'Carbs', val: result.macros?.carbs, color: 'bg-green-400', unit: 'g' },
                    { label: 'Fat', val: result.macros?.fat, color: 'bg-yellow-400', unit: 'g' },
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
              <div className="grid grid-cols-2 gap-4">
                <div className="card text-center">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <Droplets size={20} className="text-blue-500" />
                  </div>
                  <div className="font-bold text-xl text-blue-600">{result.water_ml} ml</div>
                  <div className="text-xs text-gray-400 mt-0.5">Water per day</div>
                </div>
                {result.timeline && (
                  <div className="card text-center">
                    <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                      <Calendar size={20} className="text-primary-500" />
                    </div>
                    <div className="font-bold text-lg text-primary-600">{result.timeline}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Target time</div>
                    {result.weekly_rate && <div className="text-xs text-gray-500">{result.weekly_rate}</div>}
                  </div>
                )}
              </div>
              {result.meal_plan && (
                <div className="card">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Utensils size={16} className="text-primary-600" /> Meal Plan ({result.meals_per_day} meals/day)
                  </h3>
                  <div className="space-y-2">
                    {result.meal_plan.map((meal: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-16 text-xs text-gray-400 font-medium">{meal.time}</div>
                        <div className="flex-1">
                          <span className="font-medium text-sm text-gray-800">{meal.name}</span>
                          <div className="text-xs text-gray-400">{meal.ratio}% of calories</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="font-semibold text-gray-700">{meal.calories} kcal</span>
                          <span>P:{meal.protein}g</span>
                          <span>F:{meal.fat}g</span>
                          <span>C:{meal.carbs}g</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="card border-2 border-primary-100 bg-primary-50/30">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <ShoppingCart size={16} className="text-primary-600" /> Generate Basket
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  System will build a {result.adjusted_calories} kcal basket based on your profile
                </p>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setVeganMode(!veganMode)}
                    className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all', veganMode ? 'bg-green-500 text-white border-green-500' : 'bg-white text-green-700 border-green-300')}>
                    <Leaf size={12} /> Vegan
                  </button>
                  <button onClick={() => setShowFilter(!showFilter)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:bg-gray-50">
                    <Filter size={12} /> Filter {excludedCats.length > 0 && `(-${excludedCats.length})`}
                  </button>
                </div>
                {showFilter && (
                  <div className="mb-3">
                    <CategoryFilter categories={categories} excluded={excludedCats} onChange={setExcludedCats} />
                  </div>
                )}
                <button onClick={handleGenerateBasket} disabled={basketLoading}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  {basketLoading ? <><Loader2 size={15} className="animate-spin" /> Generating...</> : <><ShoppingCart size={15} /> Generate Basket ({result.adjusted_calories} kcal)</>}
                </button>
              </div>
              {basket.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <ShoppingCart size={16} className="text-primary-600" /> Food Basket
                      <span className="tag bg-primary-50 text-primary-700">{basket.length} items</span>
                    </h3>
                    <button onClick={() => setShowRecipe(true)} className="btn-secondary flex items-center gap-2 text-sm">
                      <ChefHat size={15} /> Recipe
                    </button>
                  </div>
                  <BasketResults />
                </div>
              )}
              {showRecipe && <RecipeModal basket={basket} totals={totals} onClose={() => setShowRecipe(false)} />}
            </>
          ) : (
            <div className="card flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-accent-50 rounded-2xl flex items-center justify-center mb-4">
                <Brain size={28} className="text-accent-300" />
              </div>
              <p className="text-gray-400 text-sm">
                {savedProfile ? 'Profile saved. Loading your daily plan...' : 'Fill in the 3-block questionnaire to get your personalized plan'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
