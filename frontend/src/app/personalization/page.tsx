'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api, basketApi } from '@/lib/api';
import { useBasketStore } from '@/store/basket.store';
import { BasketResults } from '@/components/basket/BasketResults';
import { CategoryFilter } from '@/components/basket/CategoryFilter';
import { RecipeModal } from '@/components/basket/RecipeModal';
import {
  Brain, Loader2, Scale, Flame, Dumbbell, Moon, Footprints,
  Brain as BrainIcon, Droplets, ChevronRight, ShoppingCart,
  TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle,
  Info, RefreshCw, Filter, Leaf, ChefHat
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import Link from 'next/link';

export default function PersonalizationPage() {
  const { user } = useAuthStore();
  const { basket, totals, setBasket } = useBasketStore();

  // ── state ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'profile' | 'checkin' | 'result'>('profile');
  const [profileLoading, setProfileLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [basketLoading, setBasketLoading] = useState(false);
  const [savedProfile, setSavedProfile] = useState<any>(null);
  const [modelResult, setModelResult] = useState<any>(null);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [checkinNeeded, setCheckinNeeded] = useState(false);
  const [selectedCalories, setSelectedCalories] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [excludedCats, setExcludedCats] = useState<string[]>([]);
  const [veganMode, setVeganMode] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    gender: 'male', age: '', height_cm: '', weight_kg: '',
    goal: 'loss', aggressiveness: 'moderate',
  });

  // Checkin form
  const [checkinForm, setCheckinForm] = useState({
    weight_kg: '', calories: '', exercise_min: '',
    sleep_h: '', steps: '', stress: '', hydration_l: '',
  });

  // ── load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    basketApi.categories().then(({ data }) => setCategories(data.categories)).catch(() => {});

    if (!user) { setProfileLoading(false); return; }

    Promise.all([
      api.get('/personalization/profile').catch(() => ({ data: { profile: null } })),
      api.get('/checkin/latest').catch(() => ({ data: { result: null, total_checkins: 0 } })),
    ]).then(([profRes, checkinRes]) => {
      const prof = profRes.data.profile;
      const total = checkinRes.data.total_checkins || 0;
      const lastResult = checkinRes.data.result;

      setTotalCheckins(total);

      if (prof) {
        setSavedProfile(prof);
        setProfileForm({
          gender: prof.gender || 'male',
          age: String(prof.age || ''),
          height_cm: String(prof.height_cm || ''),
          weight_kg: String(prof.weight_kg || ''),
          goal: prof.goal || 'loss',
          aggressiveness: prof.aggressiveness || 'moderate',
        });

        // შევამოწმოთ check-in საჭიროა თუ არა (7 დღეში ერთხელ)
        if (lastResult) {
          const lastDate = new Date(lastResult.calculated_at);
          const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince >= 7) {
            setCheckinNeeded(true);
            setStep('checkin');
          } else {
            setModelResult(lastResult);
            setSelectedCalories(lastResult.reg_rec);
            setStep('result');
          }
        } else {
          // პირველი check-in
          setCheckinNeeded(true);
          setStep('checkin');
        }
      } else {
        setStep('profile');
      }
    }).finally(() => setProfileLoading(false));
  }, [user]);

  // ── save profile ───────────────────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.age || !profileForm.height_cm || !profileForm.weight_kg) {
      toast.error('ყველა ველი სავალდებულოა'); return;
    }
    try {
      await api.post('/personalization/profile', {
        gender: profileForm.gender,
        age: parseInt(profileForm.age),
        height_cm: parseFloat(profileForm.height_cm),
        weight_kg: parseFloat(profileForm.weight_kg),
        activity_level: 'medium',
        goal: profileForm.goal,
        aggressiveness: profileForm.aggressiveness,
        target_weight_kg: parseFloat(profileForm.weight_kg),
        eating_window: 'standard',
        carb_sensitivity: 'neutral',
        hunger_peak: 'even',
        vegan_mode: false,
      });
      setSavedProfile({ ...profileForm });
      setCheckinNeeded(true);
      setStep('checkin');
      toast.success('პროფილი შენახულია!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    }
  };

  // ── checkin ────────────────────────────────────────────────────────────────
  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckinLoading(true);
    try {
      const sex = (savedProfile?.gender || profileForm.gender) === 'male' ? 1 : 0;
      const age = parseInt(savedProfile?.age || profileForm.age);
      const height_cm = parseFloat(savedProfile?.height_cm || profileForm.height_cm);

      const payload = {
        weight_kg:      parseFloat(checkinForm.weight_kg),
        calories:       parseInt(checkinForm.calories),
        exercise_min:   parseInt(checkinForm.exercise_min),
        sleep_h:        parseFloat(checkinForm.sleep_h),
        steps:          parseInt(checkinForm.steps),
        stress:         parseInt(checkinForm.stress),
        hydration_l:    parseFloat(checkinForm.hydration_l),
        goal:           savedProfile?.goal || profileForm.goal,
        aggressiveness: savedProfile?.aggressiveness || profileForm.aggressiveness,
        sex, age, height_cm,
      };

      const { data } = await api.post('/checkin', payload);
      if (data.result) {
        setModelResult(data.result);
        setSelectedCalories(data.result.reg_rec);
        setTotalCheckins(data.total_checkins);
        setStep('result');
        toast.success('✅ Check-in შენახულია!');
      } else {
        toast.error(data.error || 'მოდელის გამოთვლა ვერ მოხდა');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    } finally {
      setCheckinLoading(false);
    }
  };

  // ── basket ─────────────────────────────────────────────────────────────────
  const handleGenerateBasket = async () => {
    if (!selectedCalories) { toast.error('აირჩიეთ კალორიების რაოდენობა'); return; }
    setBasketLoading(true);
    try {
      const prof = savedProfile || profileForm;
      const { data } = await basketApi.generate({
        gender: prof.gender,
        age: parseInt(prof.age),
        weight_kg: parseFloat(prof.weight_kg || checkinForm.weight_kg),
        height_cm: parseFloat(prof.height_cm),
        activity_level: prof.activity_level || 'medium',
        goal: prof.goal || profileForm.goal,
        target_weight_kg: parseFloat(prof.target_weight_kg || prof.weight_kg),
        eating_window: prof.eating_window || 'standard',
        carb_sensitivity: prof.carb_sensitivity || 'neutral',
        hunger_peak: prof.hunger_peak || 'even',
        vegan_mode: veganMode,
        excluded_categories: excludedCats,
        override_calories: selectedCalories,
      });
      setBasket(data.basket, data.totals, data.targets);
      toast.success('კალათა გენერირდა!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    } finally {
      setBasketLoading(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  if (profileLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Brain size={48} className="mx-auto text-primary-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">შედით სისტემაში</h2>
        <p className="text-gray-500 mb-6">პერსონალიზაციისთვის საჭიროა ავტორიზაცია</p>
        <Link href="/auth/login" className="btn-primary">შესვლა</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* ── პროფილი ── */}
      {step === 'profile' && (
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-6">
            <Brain size={40} className="mx-auto text-primary-500 mb-3" />
            <h1 className="text-2xl font-display font-bold text-gray-900">პერსონალიზაცია</h1>
            <p className="text-sm text-gray-500 mt-1">შეავსეთ თქვენი მონაცემები</p>
          </div>

          <div className="card shadow-lg">
            <form onSubmit={handleSaveProfile} className="space-y-4">

              {/* სქესი */}
              <div>
                <label className="label">სქესი</label>
                <div className="grid grid-cols-2 gap-3">
                  {[['male','♂ მამრობითი'],['female','♀ მდედრობითი']].map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setProfileForm({...profileForm, gender: val})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profileForm.gender === val
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ასაკი, სიმაღლე, წონა */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key:'age', label:'ასაკი', ph:'25', min:16, max:100 },
                  { key:'height_cm', label:'სიმაღლე (სმ)', ph:'175', min:100, max:250 },
                  { key:'weight_kg', label:'წონა (კგ)', ph:'70', min:20, max:300 },
                ].map(({ key, label, ph, min, max }) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input type="number" className="input" placeholder={ph} min={min} max={max}
                      value={(profileForm as any)[key]}
                      onChange={e => setProfileForm({...profileForm, [key]: e.target.value})}
                      required />
                  </div>
                ))}
              </div>

              {/* მიზანი */}
              <div>
                <label className="label">მიზანი</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['loss','⬇️ კლება'],
                    ['maintain','➡️ შენარჩუნება'],
                    ['gain','⬆️ მომატება'],
                  ].map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setProfileForm({...profileForm, goal: val})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profileForm.goal === val
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ტემპი */}
              <div>
                <label className="label">ტემპი</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['conservative','🐢 ნელი'],
                    ['moderate','⚖️ ზომიერი'],
                    ['aggressive','🔥 სწრაფი'],
                  ].map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setProfileForm({...profileForm, aggressiveness: val})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profileForm.aggressiveness === val
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                <ChevronRight size={16} /> შემდეგი
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Check-in ── */}
      {step === 'checkin' && (
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-6">
            <RefreshCw size={36} className="mx-auto text-primary-500 mb-3" />
            <h1 className="text-2xl font-display font-bold text-gray-900">კვირეული Check-in</h1>
            <p className="text-sm text-gray-500 mt-1">კვირა #{totalCheckins} · შეავსეთ ამ კვირის მონაცემები</p>
          </div>

          {/* progress bar */}
          <div className="mb-4 space-y-1">
            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-400 to-accent-500 rounded-full"
                style={{ width: `${Math.min((totalCheckins / 14) * 100, 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Phase 1</span><span>Phase 2 (4კვ)</span>
              <span>Phase 3 (8კვ)</span><span>Phase 4 (14კვ)</span>
            </div>
          </div>

          <div className="card shadow-lg">
            <form onSubmit={handleCheckin} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key:'weight_kg', label:'წონა (კგ)', icon:Scale, ph:'70.5', step:'0.1', min:20, max:300, hint:'დილით, უზმოზე' },
                  { key:'calories', label:'კალორიები (კკ)', icon:Flame, ph:'2000', step:'50', min:500, max:10000, hint:'დღიური მოხმარება', full:true },
                  { key:'exercise_min', label:'ვარჯიში (წთ)', icon:Dumbbell, ph:'45', step:'5', min:0, max:900, hint:'კვირის სულ' },
                  { key:'sleep_h', label:'ძილი (სთ)', icon:Moon, ph:'7.5', step:'0.5', min:2, max:14, hint:'ღამის საშუალო' },
                  { key:'steps', label:'ნაბიჯები', icon:Footprints, ph:'8000', step:'500', min:0, max:80000, hint:'დღიური საშუალო' },
                  { key:'stress', label:'სტრესი (1–40)', icon:BrainIcon, ph:'10', step:'1', min:1, max:40, hint:'1=მინ · 40=მაქს' },
                  { key:'hydration_l', label:'წყალი (ლ)', icon:Droplets, ph:'2.0', step:'0.1', min:0.5, max:10, hint:'დღიური მოხმარება' },
                ].map(({ key, label, icon:Icon, ph, step, min, max, hint, full }: any) => (
                  <div key={key} className={full ? 'col-span-2' : ''}>
                    <label className="label flex items-center gap-1.5">
                      <Icon size={13} className="text-primary-500"/> {label}
                    </label>
                    <input type="number" step={step} min={min} max={max}
                      className="input" placeholder={ph}
                      value={(checkinForm as any)[key]}
                      onChange={e => setCheckinForm({...checkinForm, [key]: e.target.value})}
                      required />
                    <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
                  </div>
                ))}
              </div>

              <button type="submit" disabled={checkinLoading}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {checkinLoading
                  ? <><Loader2 size={16} className="animate-spin"/> გამოთვლა...</>
                  : <><ChevronRight size={16}/> შენახვა და გამოთვლა</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── შედეგი ── */}
      {step === 'result' && modelResult && (
        <div className="space-y-6">

          {/* მოდელის შედეგი */}
          <div className={clsx('card border-2 shadow-lg',
            modelResult.plateau_detected ? 'border-yellow-300' : 'border-primary-100')}>

            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {modelResult.plateau_detected
                    ? <AlertTriangle size={18} className="text-yellow-600"/>
                    : <CheckCircle size={18} className="text-green-600"/>}
                  <h2 className="font-bold text-gray-900 text-lg">
                    {modelResult.plateau_detected ? 'პლატო' : 'კალორიების რეკომენდაცია'}
                  </h2>
                </div>
                <p className="text-xs text-gray-500">
                  Phase {modelResult.phase} · კვირა #{totalCheckins} · {modelResult.message}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary-600">{modelResult.tdee_kcal}</div>
                <div className="text-xs text-gray-400">კკ/დღე TDEE</div>
              </div>
            </div>

            {/* 3 რეკომენდაცია */}
            <p className="text-xs text-gray-500 mb-3">აირჩიეთ კალორიების რაოდენობა კალათის გასაკეთებლად:</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label:'ცხიმის\nმოდელი', key:'fat_rec', dm:'expected_dm_fat_kg', color:'blue', desc:'7700 კკ/კგ' },
                { label:'კუნთის\nმოდელი', key:'mus_rec', dm:'expected_dm_mus_kg', color:'green', desc:'950 კკ/კგ' },
                { label:'ML\nრეგრესია', key:'reg_rec', dm:'expected_dm_reg_kg', color:'purple', desc:'პერსონალიზებული' },
              ].map(({ label, key, dm, color, desc }) => {
                const val = modelResult[key];
                const isSelected = selectedCalories === val;
                return (
                  <button key={key} onClick={() => setSelectedCalories(val)}
                    className={clsx('rounded-xl p-3 text-center border-2 transition-all',
                      isSelected
                        ? `border-${color}-500 bg-${color}-50 shadow-sm`
                        : 'border-gray-200 hover:border-gray-300 bg-white')}>
                    <div className="text-[10px] font-medium text-gray-500 mb-1 whitespace-pre-line leading-tight">{label}</div>
                    <div className={clsx('text-2xl font-bold',
                      color === 'blue' ? 'text-blue-700' : color === 'green' ? 'text-green-700' : 'text-purple-700')}>
                      {val}
                    </div>
                    <div className="text-[10px] text-gray-400">კკ/დღე</div>
                    <div className="text-[10px] font-medium text-gray-500 mt-1">{desc}</div>
                    <div className={clsx('text-xs font-semibold mt-1',
                      modelResult[dm] < 0 ? 'text-blue-600' : 'text-green-600')}>
                      {modelResult[dm] > 0 ? '+' : ''}{modelResult[dm]} კგ/თვ
                    </div>
                    {isSelected && (
                      <div className="mt-1.5">
                        <CheckCircle size={14} className={clsx('mx-auto',
                          color === 'blue' ? 'text-blue-500' : color === 'green' ? 'text-green-500' : 'text-purple-500')} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* დეტალები */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              {[
                { label:'ადაპტაცია', val:`×${Number(modelResult.adaptation_factor||1).toFixed(3)}` },
                { label:'λ', val:Number(modelResult.lambda_i||1).toFixed(3) },
                { label:'დეფ. კვ.', val:`${modelResult.deficit_weeks||0}` },
                { label:'Phase', val:modelResult.phase },
              ].map(({ label, val }) => (
                <div key={label} className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                  <div className="text-gray-400">{label}</div>
                  <div className="font-semibold text-gray-800">{val}</div>
                </div>
              ))}
            </div>

            {modelResult.diet_break_suggested && (
              <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-800 flex items-start gap-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                <span>Diet break რეკომენდებულია — 1-2 კვირა TDEE-ზე ჭამა.</span>
              </div>
            )}

            <button onClick={() => { setStep('checkin'); setCheckinForm({ weight_kg:'', calories:'', exercise_min:'', sleep_h:'', steps:'', stress:'', hydration_l:'' }); }}
              className="mt-3 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <RefreshCw size={11}/> ახალი check-in
            </button>
          </div>

          {/* კალათის გენერაცია */}
          <div className="card shadow-lg">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary-600"/> კალათის გენერაცია
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              არჩეული: <span className="font-bold text-primary-600">{selectedCalories} კკ/დღე</span>
            </p>

            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <button onClick={() => setShowFilter(!showFilter)}
                className="flex items-center gap-2 btn-secondary text-sm">
                <Filter size={14}/> ფილტრი
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={veganMode}
                  onChange={e => setVeganMode(e.target.checked)}
                  className="w-4 h-4 accent-green-500" />
                <Leaf size={14} className="text-green-500"/> ვეგანური
              </label>
            </div>

            {showFilter && (
              <div className="mb-4">
                <CategoryFilter categories={categories} excluded={excludedCats} onChange={setExcludedCats} />
              </div>
            )}

            <button onClick={handleGenerateBasket} disabled={basketLoading || !selectedCalories}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {basketLoading
                ? <><Loader2 size={16} className="animate-spin"/> გენერირება...</>
                : <><ShoppingCart size={16}/> კალათის გენერირება</>}
            </button>
          </div>

          {/* კალათის შედეგი */}
          {basket && (
            <div className="space-y-4">
              <BasketResults />
              <button onClick={() => setShowRecipe(true)}
                className="btn-secondary w-full flex items-center justify-center gap-2">
                <ChefHat size={15}/> რეცეპტების ნახვა
              </button>
            </div>
          )}
        </div>
      )}

      {showRecipe && basket && <RecipeModal basket={basket} totals={totals} onClose={() => setShowRecipe(false)} />}
    </div>
  );
}
