'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Brain, Loader2, Droplets, Utensils, Calendar, AlertTriangle, TrendingDown, TrendingUp, Minus, Activity } from 'lucide-react';
import { nutritionApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const schema = z.object({
  gender: z.enum(['male', 'female']),
  age: z.number().min(10).max(100),
  height: z.number().min(100).max(250),
  weight: z.number().min(30).max(300),
  activity: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  goal: z.enum(['lose', 'gain', 'maintain']),
  target_weight: z.number().min(30).max(300).optional(),
});

type FormData = z.infer<typeof schema>;

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'უმოძრაო (მაგიდასთან)',
  light: 'მსუბუქი (კვ. 1-3 ვარ.)',
  moderate: 'ზომიერი (კვ. 3-5 ვარ.)',
  active: 'აქტიური (კვ. 6-7 ვარ.)',
  very_active: 'ძალიან აქტიური (2x/დღე)',
};

const GOAL_CONFIG = {
  lose: { label: 'წონის კლება', icon: TrendingDown, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  gain: { label: 'წონის მომატება', icon: TrendingUp, color: 'text-green-600 bg-green-50 border-green-200' },
  maintain: { label: 'შენარჩუნება', icon: Minus, color: 'text-gray-600 bg-gray-50 border-gray-200' },
};

export default function PersonalizationPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { gender: 'male', activity: 'moderate', goal: 'maintain' },
  });

  const goal = watch('goal');

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { data: res } = await nutritionApi.calculate(data);
      setResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success('გათვლა დასრულდა! ✅');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა გათვლაში');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900">პერსონალიზაცია</h1>
        <p className="text-sm text-gray-500 mt-0.5">პროფესიონალური კვების გეგმა თქვენი პარამეტრების მიხედვით</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-accent-50 rounded-lg flex items-center justify-center">
                <Brain size={16} className="text-accent-600" />
              </div>
              <h2 className="font-semibold text-gray-900">მონაცემების შეყვანა</h2>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Gender */}
              <div>
                <label className="label">სქესი</label>
                <div className="flex gap-2">
                  {[{ v: 'male', l: '👨 მამრობითი' }, { v: 'female', l: '👩 მდედრობითი' }].map(({ v, l }) => (
                    <label key={v} className="flex-1 cursor-pointer">
                      <input type="radio" value={v} {...register('gender')} className="peer sr-only" />
                      <div className="text-center py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium transition-all peer-checked:border-primary-400 peer-checked:bg-primary-50 peer-checked:text-primary-700 hover:border-gray-300 text-gray-600">
                        {l}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Age, Height, Weight */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: 'age', label: 'ასაკი', placeholder: '30' },
                  { name: 'height', label: 'სიმაღლე (სმ)', placeholder: '175' },
                  { name: 'weight', label: 'წონა (კგ)', placeholder: '75' },
                ].map(({ name, label, placeholder }) => (
                  <div key={name}>
                    <label className="label text-xs">{label}</label>
                    <input
                      type="number"
                      className="input text-sm py-2"
                      placeholder={placeholder}
                      {...register(name as any, { valueAsNumber: true })}
                    />
                    {errors[name as keyof typeof errors] && (
                      <p className="text-red-500 text-[10px] mt-0.5">სავალდებულო</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Activity */}
              <div>
                <label className="label">აქტიურობის დონე</label>
                <select className="input text-sm" {...register('activity')}>
                  {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Goal */}
              <div>
                <label className="label">მიზანი</label>
                <div className="space-y-2">
                  {Object.entries(GOAL_CONFIG).map(([v, { label, icon: Icon, color }]) => (
                    <label key={v} className="cursor-pointer">
                      <input type="radio" value={v} {...register('goal')} className="peer sr-only" />
                      <div className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border transition-all',
                        'peer-checked:ring-2 peer-checked:ring-primary-400',
                        goal === v ? color : 'border-gray-100 hover:border-gray-200'
                      )}>
                        <Icon size={16} />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Target weight */}
              {(goal === 'lose' || goal === 'gain') && (
                <div>
                  <label className="label">სამიზნე წონა (კგ) — სურვილისამებრ</label>
                  <input
                    type="number"
                    className="input text-sm"
                    placeholder="მაგ: 70"
                    {...register('target_weight', { valueAsNumber: true })}
                  />
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={15} className="animate-spin" /> გათვლა...</> : '🧮 გათვლა'}
              </button>
            </form>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          {result ? (
            <>
              {/* Warning */}
              {result.warning && (
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <AlertTriangle size={18} className="text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">{result.warning}</p>
                </div>
              )}

              {/* Main Stats */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-primary-600" />
                  მეტაბოლური გათვლები
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'BMR', val: result.bmr, unit: 'კკალ', desc: 'ძირითადი' },
                    { label: 'TDEE', val: result.tdee, unit: 'კკალ', desc: 'სულ ბრუნვა' },
                    { label: 'სამიზნე', val: result.adjusted_calories, unit: 'კკალ', desc: 'დღიური', highlight: true },
                    { label: 'BMI', val: result.bmi, unit: '', desc: result.bmi_class === 'normal' ? '✅ ნორმა' : result.bmi_class },
                  ].map(({ label, val, unit, desc, highlight }) => (
                    <div key={label} className={clsx('rounded-xl p-3 text-center', highlight ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50')}>
                      <div className={clsx('font-bold text-xl', highlight ? 'text-primary-700' : 'text-gray-800')}>
                        {val}{unit}
                      </div>
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
                    { label: 'ცილა', val: result.macros.protein, max: result.macros.protein, color: 'bg-blue-400', unit: 'გ' },
                    { label: 'ნახშირწყლები', val: result.macros.carbs, max: result.macros.carbs, color: 'bg-green-400', unit: 'გ' },
                    { label: 'ცხიმი', val: result.macros.fat, max: result.macros.fat, color: 'bg-yellow-400', unit: 'გ' },
                  ].map(({ label, val, color, unit }) => {
                    const total = result.macros.protein + result.macros.carbs + result.macros.fat;
                    const pct = Math.round((val / total) * 100);
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{label}</span>
                          <span className="text-gray-500">{val}{unit} <span className="text-gray-400 text-xs">({pct}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
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
                  <div className="text-xs text-gray-500 mt-1">{(result.water_ml / 1000).toFixed(1)} ლიტრი</div>
                </div>

                {result.timeline && (
                  <div className="card text-center">
                    <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                      <Calendar size={20} className="text-primary-500" />
                    </div>
                    <div className="font-bold text-xl text-primary-600">{result.timeline}</div>
                    <div className="text-xs text-gray-400 mt-0.5">სამიზნე დრო</div>
                    <div className="text-xs text-gray-500 mt-1">{result.weekly_rate_kg} კგ/კვირა</div>
                  </div>
                )}
              </div>

              {/* Meal Plan */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Utensils size={16} className="text-primary-600" />
                  კვების გეგმა ({result.meals_per_day} კვება/დღე)
                </h3>
                <div className="space-y-2">
                  {result.meal_plan.map((meal: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-7 h-7 bg-primary-100 rounded-lg flex items-center justify-center text-xs font-bold text-primary-700">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <span className="font-medium text-sm text-gray-800">{meal.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">{meal.calories} კკალ</span>
                        <span>ც:{meal.protein}გ</span>
                        <span>ცხ:{meal.fat}გ</span>
                        <span>ნ:{meal.carbs}გ</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <AlertTriangle size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400">{result.disclaimer}</p>
              </div>
            </>
          ) : (
            <div className="card flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-accent-50 rounded-2xl flex items-center justify-center mb-4">
                <Brain size={28} className="text-accent-300" />
              </div>
              <p className="text-gray-400 text-sm">შეიყვანეთ თქვენი მონაცემები<br />და მიიღეთ პერსონალური გეგმა</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
