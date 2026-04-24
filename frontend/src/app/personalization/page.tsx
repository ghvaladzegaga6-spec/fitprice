'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api, basketApi } from '@/lib/api';
import { useBasketStore } from '@/store/basket.store';
import { BasketResults } from '@/components/basket/BasketResults';
import {
  Loader2, Scale, Flame, Dumbbell, Moon, Footprints,
  Brain, Droplets, ChevronRight, ShoppingCart,
  AlertTriangle, CheckCircle, RefreshCw, Leaf, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import Link from 'next/link';

export default function PersonalizationPage() {
  const { user } = useAuthStore();
  const { basket, totals, targets, setBasket } = useBasketStore();

  const [step, setStep] = useState<'profile' | 'checkin' | 'result'>('profile');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [basketLoading, setBasketLoading] = useState(false);
  const [modelResult, setModelResult] = useState<any>(null);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [selectedCalories, setSelectedCalories] = useState<number | null>(null);
  const [veganMode, setVeganMode] = useState(false);
  const [savedProfile, setSavedProfile] = useState<any>(null);

  // პროფილის ფორმა
  const [profile, setProfile] = useState({
    gender: 'male',
    age: '',
    height_cm: '',
    weight_kg: '',
    goal: 'loss',
    aggressiveness: 'moderate',
  });

  // check-in ფორმა
  const [checkin, setCheckin] = useState({
    weight_kg: '',
    calories: '',
    exercise_min: '',
    sleep_h: '',
    steps: '',
    stress: '',
    hydration_l: '',
  });

  useEffect(() => {
    if (!user) { setLoading(false); return; }

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
        setProfile(prev => ({
          ...prev,
          gender: prof.gender || 'male',
          age: String(prof.age || ''),
          height_cm: String(prof.height_cm || ''),
          weight_kg: String(prof.weight_kg || ''),
          goal: prof.goal === 'lose' ? 'loss' : prof.goal || 'loss',
          aggressiveness: prof.aggressiveness || 'moderate',
        }));

        if (lastResult) {
          const daysSince = (Date.now() - new Date(lastResult.calculated_at).getTime()) / 86400000;
          if (daysSince >= 7) {
            setStep('checkin');
          } else {
            setModelResult(lastResult);
            setSelectedCalories(lastResult.reg_rec);
            setStep('result');
          }
        } else {
          setStep('checkin');
        }
      }
    }).finally(() => setLoading(false));
  }, [user]);

  // პროფილის შენახვა
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.age || !profile.height_cm || !profile.weight_kg) {
      toast.error('ყველა ველი სავალდებულოა'); return;
    }
    setSubmitting(true);
    try {
      await api.post('/personalization/calculate', {
        gender: profile.gender,
        age: parseInt(profile.age),
        height_cm: parseFloat(profile.height_cm),
        weight_kg: parseFloat(profile.weight_kg),
        activity_level: 'medium',
        goal: profile.goal === 'loss' ? 'lose' : profile.goal,
        target_weight_kg: parseFloat(profile.weight_kg),
        eating_window: 'standard',
        carb_sensitivity: 'neutral',
        hunger_peak: 'even',
        vegan_mode: false,
      });
      setSavedProfile({ ...profile });
      setStep('checkin');
      toast.success('✅ პროფილი შენახულია!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    } finally {
      setSubmitting(false);
    }
  };

  // check-in შენახვა
  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const prof = savedProfile || profile;
      const sex = (prof.gender || 'male') === 'male' ? 1 : 0;
      const age = parseInt(prof.age);
      const height_cm = parseFloat(prof.height_cm);
      const goal = (prof.goal === 'lose' || prof.goal === 'loss') ? 'loss'
        : prof.goal === 'gain' ? 'gain' : 'maintain';

      const { data } = await api.post('/checkin', {
        weight_kg:      parseFloat(checkin.weight_kg),
        calories:       parseInt(checkin.calories),
        exercise_min:   parseInt(checkin.exercise_min),
        sleep_h:        parseFloat(checkin.sleep_h),
        steps:          parseInt(checkin.steps),
        stress:         parseInt(checkin.stress),
        hydration_l:    parseFloat(checkin.hydration_l),
        goal,
        aggressiveness: prof.aggressiveness || 'moderate',
        sex, age, height_cm,
      });

      if (data.result) {
        setModelResult(data.result);
        setSelectedCalories(data.result.reg_rec);
        setTotalCheckins(data.total_checkins);
        setStep('result');
        toast.success('✅ შედეგი გამოთვლილია!');
      } else {
        toast.error(data.error || 'მოდელის გამოთვლა ვერ მოხდა');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    } finally {
      setSubmitting(false);
    }
  };

  // კალათის გენერაცია
  const handleBasket = async () => {
    if (!selectedCalories) { toast.error('აირჩიეთ კალორიები'); return; }
    setBasketLoading(true);
    try {
      const prof = savedProfile || profile;
      const { data } = await basketApi.generate({
        gender: prof.gender,
        age: parseInt(prof.age),
        weight_kg: parseFloat(checkin.weight_kg || prof.weight_kg),
        height_cm: parseFloat(prof.height_cm),
        activity_level: 'medium',
        goal: (prof.goal === 'lose' || prof.goal === 'loss') ? 'lose' : prof.goal,
        target_weight_kg: parseFloat(prof.weight_kg),
        eating_window: 'standard',
        carb_sensitivity: 'neutral',
        hunger_peak: 'even',
        vegan_mode: veganMode,
        excluded_categories: [],
        override_calories: selectedCalories,
      });
      setBasket(data.basket, data.totals, data.targets);
      toast.success('✅ კალათა გენერირდა!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    } finally {
      setBasketLoading(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="animate-spin text-primary-500" size={32} />
    </div>
  );

  if (!user) return (
    <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
      <h2 className="text-xl font-bold text-gray-900">შედით სისტემაში</h2>
      <Link href="/auth/login" className="btn-primary inline-block">შესვლა</Link>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* ── პროფილი ── */}
      {step === 'profile' && (
        <div>
          <div className="text-center mb-6">
            <h1 className="text-2xl font-display font-bold text-gray-900">პერსონალიზაცია</h1>
            <p className="text-sm text-gray-500 mt-1">შეავსეთ თქვენი მონაცემები</p>
          </div>
          <div className="card shadow-lg">
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* სქესი */}
              <div>
                <label className="label">სქესი</label>
                <div className="grid grid-cols-2 gap-3">
                  {[['male','♂ მამრობითი'],['female','♀ მდედრობითი']].map(([v,l]) => (
                    <button key={v} type="button"
                      onClick={() => setProfile({...profile, gender: v})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profile.gender === v ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {/* ასაკი, სიმაღლე, წონა */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { k:'age', l:'ასაკი', ph:'25', min:16, max:100 },
                  { k:'height_cm', l:'სიმაღლე (სმ)', ph:'175', min:100, max:250 },
                  { k:'weight_kg', l:'წონა (კგ)', ph:'70', min:20, max:300 },
                ].map(({ k, l, ph, min, max }) => (
                  <div key={k}>
                    <label className="label">{l}</label>
                    <input type="number" className="input" placeholder={ph} min={min} max={max}
                      value={(profile as any)[k]}
                      onChange={e => setProfile({...profile, [k]: e.target.value})}
                      required />
                  </div>
                ))}
              </div>
              {/* მიზანი */}
              <div>
                <label className="label">მიზანი</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['loss','⬇️ კლება'],['maintain','➡️ შენარჩუნება'],['gain','⬆️ მომატება']].map(([v,l]) => (
                    <button key={v} type="button"
                      onClick={() => setProfile({...profile, goal: v})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profile.goal === v ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {/* ტემპი */}
              <div>
                <label className="label">ტემპი</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['conservative','🐢 ნელი'],['moderate','⚖️ ზომიერი'],['aggressive','🔥 სწრაფი']].map(([v,l]) => (
                    <button key={v} type="button"
                      onClick={() => setProfile({...profile, aggressiveness: v})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profile.aggressiveness === v ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={submitting}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {submitting ? <><Loader2 size={16} className="animate-spin"/> მუშავდება...</>
                  : <><ChevronRight size={16}/> შემდეგი</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Check-in ── */}
      {step === 'checkin' && (
        <div>
          <div className="text-center mb-4">
            <h1 className="text-2xl font-display font-bold text-gray-900">კვირეული მონაცემები</h1>
            <p className="text-sm text-gray-500 mt-1">კვირა #{totalCheckins}</p>
          </div>
          {/* progress */}
          <div className="mb-4 space-y-1">
            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-400 to-accent-500 rounded-full"
                style={{ width: `${Math.min((totalCheckins/14)*100, 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Phase 1</span><span>Phase 2 (4კვ)</span>
              <span>Phase 3 (8კვ)</span><span>Phase 4 (14კვ)</span>
            </div>
          </div>
          <div className="card shadow-lg">
            <form onSubmit={handleCheckin} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k:'weight_kg', l:'წონა (კგ)', I:Scale, ph:'70.5', step:'0.1', min:20, max:300, hint:'დილით, უზმოზე' },
                  { k:'calories', l:'კალორიები (კკ)', I:Flame, ph:'2000', step:'50', min:500, max:10000, hint:'დღიური მოხმარება', full:true },
                  { k:'exercise_min', l:'ვარჯიში (წთ)', I:Dumbbell, ph:'45', step:'5', min:0, max:900, hint:'კვირის სულ' },
                  { k:'sleep_h', l:'ძილი (სთ)', I:Moon, ph:'7.5', step:'0.5', min:2, max:14, hint:'ღამის საშუალო' },
                  { k:'steps', l:'ნაბიჯები', I:Footprints, ph:'8000', step:'500', min:0, max:80000, hint:'დღიური საშუალო' },
                  { k:'stress', l:'სტრესი (1–40)', I:Brain, ph:'10', step:'1', min:1, max:40, hint:'1=მინ · 40=მაქს' },
                  { k:'hydration_l', l:'წყალი (ლ)', I:Droplets, ph:'2.0', step:'0.1', min:0.5, max:10, hint:'დღიური' },
                ].map(({ k, l, I, ph, step, min, max, hint, full }: any) => (
                  <div key={k} className={full ? 'col-span-2' : ''}>
                    <label className="label flex items-center gap-1.5">
                      <I size={13} className="text-primary-500"/> {l}
                    </label>
                    <input type="number" step={step} min={min} max={max}
                      className="input" placeholder={ph}
                      value={(checkin as any)[k]}
                      onChange={e => setCheckin({...checkin, [k]: e.target.value})}
                      required />
                    <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
                  </div>
                ))}
              </div>
              <button type="submit" disabled={submitting}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {submitting ? <><Loader2 size={16} className="animate-spin"/> გამოთვლა...</>
                  : <><ChevronRight size={16}/> შენახვა და გამოთვლა</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── შედეგი ── */}
      {step === 'result' && modelResult && (
        <div className="space-y-5">
          {/* მოდელის შედეგი */}
          <div className={clsx('card border-2 shadow-lg',
            modelResult.plateau_detected ? 'border-yellow-300' : 'border-primary-100')}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {modelResult.plateau_detected
                    ? <AlertTriangle size={18} className="text-yellow-600"/>
                    : <CheckCircle size={18} className="text-green-600"/>}
                  <h2 className="font-bold text-gray-900">კალორიების რეკომენდაცია</h2>
                </div>
                <p className="text-xs text-gray-500">
                  Phase {modelResult.phase} · კვირა #{totalCheckins} · {modelResult.message}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-bold text-primary-600">{modelResult.tdee_kcal}</div>
                <div className="text-xs text-gray-400">კკ/დღე TDEE</div>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              🎯 აირჩიეთ კალორიების რაოდენობა კალათის გასაკეთებლად:
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { l:'ცხიმის\nმოდელი', k:'fat_rec', dm:'expected_dm_fat_kg', c:'blue' },
                { l:'კუნთის\nმოდელი', k:'mus_rec', dm:'expected_dm_mus_kg', c:'green' },
                { l:'ML\nრეგრესია', k:'reg_rec', dm:'expected_dm_reg_kg', c:'purple' },
              ].map(({ l, k, dm, c }) => {
                const val = modelResult[k];
                const sel = selectedCalories === val;
                return (
                  <button key={k} onClick={() => setSelectedCalories(val)}
                    className={clsx('rounded-xl p-3 text-center border-2 transition-all',
                      sel ? `border-${c}-400 bg-${c}-50 shadow` : 'border-gray-200 bg-white hover:border-gray-300')}>
                    <div className="text-[10px] text-gray-500 mb-1 whitespace-pre-line leading-tight">{l}</div>
                    <div className={clsx('text-2xl font-bold',
                      c==='blue'?'text-blue-700':c==='green'?'text-green-700':'text-purple-700')}>{val}</div>
                    <div className="text-[10px] text-gray-400">კკ/დღე</div>
                    <div className={clsx('text-xs font-semibold mt-1',
                      modelResult[dm]<0?'text-blue-600':'text-green-600')}>
                      {modelResult[dm]>0?'+':''}{modelResult[dm]} კგ/თვ
                    </div>
                    {sel && <CheckCircle size={14} className={clsx('mx-auto mt-1',
                      c==='blue'?'text-blue-500':c==='green'?'text-green-500':'text-purple-500')}/>}
                  </button>
                );
              })}
            </div>

            {modelResult.diet_break_suggested && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-800 flex gap-2 mb-3">
                <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                <span>Diet break რეკომენდებულია — 1-2 კვირა TDEE-ზე ჭამა.</span>
              </div>
            )}

            <button onClick={() => {
              setStep('checkin');
              setCheckin({ weight_kg:'', calories:'', exercise_min:'', sleep_h:'', steps:'', stress:'', hydration_l:'' });
            }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <RefreshCw size={11}/> ახალი check-in
            </button>
          </div>

          {/* კალათის გენერაცია */}
          <div className="card shadow-lg">
            <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary-600"/> კალათის გენერაცია
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              არჩეული: <span className="font-bold text-primary-600">{selectedCalories} კკ/დღე</span>
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer mb-4">
              <input type="checkbox" checked={veganMode}
                onChange={e => setVeganMode(e.target.checked)}
                className="w-4 h-4 accent-green-500"/>
              <Leaf size={14} className="text-green-500"/> ვეგანური
            </label>
            <button onClick={handleBasket} disabled={basketLoading || !selectedCalories}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {basketLoading
                ? <><Loader2 size={16} className="animate-spin"/> გენერირება...</>
                : <><ShoppingCart size={16}/> კალათის გენერირება</>}
            </button>
          </div>

          {basket && basket.length > 0 && <BasketResults />}
        </div>
      )}
    </div>
  );
}
