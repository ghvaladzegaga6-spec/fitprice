'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api, basketApi } from '@/lib/api';
import { useBasketStore } from '@/store/basket.store';
import { BasketResults } from '@/components/basket/BasketResults';
import { CategoryFilter } from '@/components/basket/CategoryFilter';
import { RecipeModal } from '@/components/basket/RecipeModal';
import { Loader2, Scale, Flame, Dumbbell, Moon, Footprints, Brain, Droplets,
  ChevronRight, ShoppingCart, AlertTriangle, CheckCircle, RefreshCw, Leaf, Filter, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import Link from 'next/link';

function getGeorgiaTime() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset()*60000 + 4*3600000);
}
const GEO_MONTHS = ['იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი','ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი'];
const GEO_DAYS = ['კვირა','ორშაბათი','სამშაბათი','ოთხშაბათი','ხუთშაბათი','პარასკევი','შაბათი'];

function checkTargetWeight(cur: number, target: number, h: number, goal: string) {
  const bmi = target / Math.pow(h/100, 2);
  const diff = Math.abs(cur - target);
  if (goal==='loss') {
    if (bmi < 16) return { w:'⛔ სამიზნე BMI '+bmi.toFixed(1)+' — სასიკვდილოდ საშიშია!', d:true };
    if (bmi < 18.5) return { w:'⚠️ სამიზნე BMI '+bmi.toFixed(1)+' — ნორმაზე დაბლაა.', d:true };
    if (diff > 20) return { w:'⚠️ '+diff.toFixed(0)+' კგ-ის დაკლება საჭიროებს 10+ თვეს.', d:false };
  }
  if (goal==='gain') {
    if (bmi > 35) return { w:'⛔ სამიზნე BMI '+bmi.toFixed(1)+' — სახიფათოა!', d:true };
    if (bmi > 30) return { w:'⚠️ სამიზნე BMI '+bmi.toFixed(1)+' — სიმსუქნის ზღვარი.', d:true };
  }
  return { w:null, d:false };
}

export default function PersonalizationPage() {
  const { user } = useAuthStore();
  const { basket, totals, targets, setBasket } = useBasketStore();

  const [step, setStep] = useState<'profile'|'checkin'|'result'>('profile');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [basketLoading, setBasketLoading] = useState(false);
  const [modelResult, setModelResult] = useState<any>(null);
  const [dailyPlan, setDailyPlan] = useState<any>(null);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [selectedCalories, setSelectedCalories] = useState<number|null>(null);
  const [veganMode, setVeganMode] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [excludedCats, setExcludedCats] = useState<string[]>([]);
  const [savedProfile, setSavedProfile] = useState<any>(null);
  const [geoTime, setGeoTime] = useState(getGeorgiaTime());

  const [profile, setProfile] = useState({
    gender:'male', age:'', height_cm:'', weight_kg:'',
    target_weight_kg:'', goal:'loss', aggressiveness:'moderate',
    hunger_peak:'even', eating_window:'standard',
  });
  const [checkin, setCheckin] = useState({
    weight_kg:'', calories:'', exercise_min:'',
    sleep_h:'', steps:'', stress:'', hydration_l:'',
  });

  useEffect(() => {
    const t = setInterval(() => setGeoTime(getGeorgiaTime()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    basketApi.categories().then(({ data }) => setCategories(data.categories)).catch(() => {});
    if (!user) { setLoading(false); return; }
    Promise.all([
      api.get('/personalization/profile').catch(() => ({ data:{ profile:null } })),
      api.get('/checkin/latest').catch(() => ({ data:{ result:null, total_checkins:0 } })),
    ]).then(([profRes, checkinRes]) => {
      const prof = profRes.data.profile;
      const total = checkinRes.data.total_checkins || 0;
      const lastResult = checkinRes.data.result;
      setTotalCheckins(total);
      if (prof) {
        setSavedProfile(prof);
        setProfile(prev => ({
          ...prev,
          gender: prof.gender||'male', age: String(prof.age||''),
          height_cm: String(prof.height_cm||''), weight_kg: String(prof.weight_kg||''),
          target_weight_kg: String(prof.target_weight_kg||''),
          goal: prof.goal==='lose'?'loss':prof.goal||'loss',
          aggressiveness: prof.aggressiveness||'moderate',
          hunger_peak: prof.hunger_peak||'even', eating_window: prof.eating_window||'standard',
        }));
        if (lastResult) {
          const daysSince = (Date.now()-new Date(lastResult.calculated_at).getTime())/86400000;
          if (daysSince >= 7) { setStep('checkin'); }
          else { setModelResult(lastResult); setSelectedCalories(lastResult.reg_rec); buildDailyPlan(lastResult, prof); setStep('result'); }
        } else { setStep('checkin'); }
      } else { setStep('profile'); }
    }).finally(() => setLoading(false));
  }, [user]);

  function buildDailyPlan(result: any, prof: any) {
    const cal = result.reg_rec || result.tdee_kcal;
    const hp = prof?.hunger_peak||'even';
    const ew = prof?.eating_window||'standard';
    const meals = ew==='outside' ? 2 : 3;
    let dist = meals===3
      ? (hp==='morning'?[.40,.35,.25]:hp==='noon'?[.25,.45,.30]:hp==='evening'?[.20,.30,.50]:[.33,.34,.33])
      : (hp==='morning'?[.55,.45]:hp==='noon'?[.40,.60]:[.45,.55]);
    const names = meals===3 ? ['საუზმე','სადილი','ვახშამი'] : ['საუზმე','სადილი'];
    setDailyPlan({ calories:cal, meals:names.map((name,i) => ({ name, calories:Math.round(cal*dist[i]), pct:Math.round(dist[i]*100) })) });
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.age||!profile.height_cm||!profile.weight_kg) { toast.error('ყველა ველი სავალდებულოა'); return; }
    if ((profile.goal==='loss'||profile.goal==='gain') && !profile.target_weight_kg) { toast.error('სამიზნე წონა სავალდებულოა'); return; }
    setSubmitting(true);
    try {
      await api.post('/personalization/calculate', {
        gender:profile.gender, age:parseInt(profile.age), height_cm:parseFloat(profile.height_cm),
        weight_kg:parseFloat(profile.weight_kg), activity_level:'medium',
        goal:profile.goal==='loss'?'lose':profile.goal,
        target_weight_kg:parseFloat(profile.target_weight_kg||profile.weight_kg),
        eating_window:profile.eating_window, carb_sensitivity:'neutral',
        hunger_peak:profile.hunger_peak, vegan_mode:false,
      });
      setSavedProfile({ ...profile });
      setStep('checkin');
      toast.success('✅ პროფილი შენახულია!');
    } catch (err:any) { toast.error(err.response?.data?.error||'შეცდომა'); }
    finally { setSubmitting(false); }
  };

  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const prof = savedProfile||profile;
      const sex = (prof.gender||'male')==='male' ? 1 : 0;
      const goal = prof.goal==='lose'||prof.goal==='loss' ? 'loss' : prof.goal==='gain' ? 'gain' : 'maintain';
      const { data } = await api.post('/checkin', {
        weight_kg:parseFloat(checkin.weight_kg), calories:parseInt(checkin.calories),
        exercise_min:parseInt(checkin.exercise_min), sleep_h:parseFloat(checkin.sleep_h),
        steps:parseInt(checkin.steps), stress:parseInt(checkin.stress),
        hydration_l:parseFloat(checkin.hydration_l),
        goal, aggressiveness:prof.aggressiveness||'moderate',
        sex, age:parseInt(prof.age), height_cm:parseFloat(prof.height_cm),
      });
      if (data.result) {
        setModelResult(data.result); setSelectedCalories(data.result.reg_rec);
        setTotalCheckins(data.total_checkins); buildDailyPlan(data.result, savedProfile||profile);
        setStep('result'); toast.success('✅ შედეგი გამოთვლილია!');
      } else { toast.error(data.error||'მოდელის გამოთვლა ვერ მოხდა'); }
    } catch (err:any) { toast.error(err.response?.data?.error||'შეცდომა'); }
    finally { setSubmitting(false); }
  };

  const handleBasket = async () => {
    if (!selectedCalories) { toast.error('კალორიები არ არის არჩეული'); return; }
    setBasketLoading(true);
    try {
      const prof = savedProfile||profile;
      const { data } = await basketApi.optimize({
        gender:prof.gender, age:parseInt(prof.age),
        weight_kg:parseFloat(checkin.weight_kg||prof.weight_kg), height_cm:parseFloat(prof.height_cm),
        activity_level:'medium', goal:prof.goal==='lose'||prof.goal==='loss'?'lose':prof.goal,
        target_weight_kg:parseFloat(prof.target_weight_kg||prof.weight_kg),
        eating_window:prof.eating_window||'standard', carb_sensitivity:'neutral',
        hunger_peak:prof.hunger_peak||'even', vegan_mode:veganMode,
        excluded_categories:excludedCats, force_promo:[], vegan_only:veganMode,
        override_calories:selectedCalories,
      });
      setBasket(data.basket, data.totals, data.targets);
      toast.success(`კალათა გენერირდა! ✅`);
    } catch (err:any) { toast.error(err.response?.data?.detail||err.response?.data?.error||'შეცდომა'); }
    finally { setBasketLoading(false); }
  };

  if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><Loader2 className="animate-spin text-primary-500" size={32}/></div>;
  if (!user) return <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4"><h2 className="text-xl font-bold">შედით სისტემაში</h2><Link href="/auth/login" className="btn-primary inline-block">შესვლა</Link></div>;

  const gd = geoTime;
  const dateStr = `${GEO_DAYS[gd.getDay()]}, ${gd.getDate()} ${GEO_MONTHS[gd.getMonth()]}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* პროფილი */}
      {step==='profile' && (
        <div>
          <div className="text-center mb-6">
            <h1 className="text-2xl font-display font-bold text-gray-900">პერსონალიზაცია</h1>
            <p className="text-sm text-gray-500 mt-1">შეავსეთ თქვენი მონაცემები</p>
          </div>
          <div className="card shadow-lg">
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div>
                <label className="label">სქესი</label>
                <div className="grid grid-cols-2 gap-3">
                  {[['male','♂ მამრობითი'],['female','♀ მდედრობითი']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setProfile({...profile,gender:v})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profile.gender===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">ასაკი</label>
                  <input type="number" className="input" placeholder="25" min={16} max={100}
                    value={profile.age} onChange={e => setProfile({...profile,age:e.target.value})} required/></div>
                <div><label className="label">სიმაღლე (სმ)</label>
                  <input type="number" className="input" placeholder="175" min={100} max={250}
                    value={profile.height_cm} onChange={e => setProfile({...profile,height_cm:e.target.value})} required/></div>
              </div>
              <div>
                <label className="label">მიზანი</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['loss','⬇️ კლება'],['maintain','➡️ შენარჩუნება'],['gain','⬆️ მომატება']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setProfile({...profile,goal:v,target_weight_kg:''})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profile.goal===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">ამჟამინდელი წონა (კგ)</label>
                  <input type="number" className="input" placeholder="75" min={20} max={300} step="0.1"
                    value={profile.weight_kg} onChange={e => setProfile({...profile,weight_kg:e.target.value})} required/></div>
                {(profile.goal==='loss'||profile.goal==='gain') && (
                  <div><label className="label">სამიზნე წონა (კგ)</label>
                    <input type="number" className="input" step="0.5"
                      placeholder={profile.goal==='loss'?'მაგ. 65':'მაგ. 80'}
                      value={profile.target_weight_kg}
                      onChange={e => setProfile({...profile,target_weight_kg:e.target.value})} required/>
                  </div>
                )}
              </div>
              {profile.target_weight_kg && profile.weight_kg && profile.height_cm && (profile.goal==='loss'||profile.goal==='gain') && (() => {
                const chk = checkTargetWeight(parseFloat(profile.weight_kg), parseFloat(profile.target_weight_kg), parseFloat(profile.height_cm), profile.goal);
                if (!chk.w) return null;
                return <div className={clsx('p-3 rounded-xl text-xs', chk.d?'bg-red-50 border border-red-200 text-red-700':'bg-yellow-50 border border-yellow-200 text-yellow-700')}>{chk.w}</div>;
              })()}
              <div>
                <label className="label">ტემპი</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['conservative','🐢 ნელი'],['moderate','⚖️ ზომიერი'],['aggressive','🔥 სწრაფი']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setProfile({...profile,aggressiveness:v})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profile.aggressiveness===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">როდის გშია ყველაზე მეტად?</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['morning','🌅 დილით'],['noon','☀️ შუადღით'],['evening','🌙 საღამოს'],['even','⚖️ თანაბრად']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setProfile({...profile,hunger_peak:v})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition',
                        profile.hunger_peak===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">სად ჭამთ ჩვეულებრივ?</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['home','🏠 სახლში'],['standard','🏠+💼 სახლი+სამსახური'],['outside','🌍 გარეთ']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setProfile({...profile,eating_window:v})}
                      className={clsx('py-2.5 rounded-xl text-sm font-medium border-2 transition text-center',
                        profile.eating_window===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={submitting} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {submitting?<><Loader2 size={16} className="animate-spin"/>მუშავდება...</>:<><ChevronRight size={16}/>შემდეგი</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Check-in */}
      {step==='checkin' && (
        <div>
          <div className="text-center mb-4">
            <h1 className="text-2xl font-display font-bold text-gray-900">კვირეული Check-in</h1>
            <p className="text-sm text-gray-500 mt-1">კვირა #{totalCheckins} · {dateStr}</p>
          </div>
          <div className="mb-4 space-y-1">
            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-400 to-accent-500 rounded-full"
                style={{width:`${Math.min((totalCheckins/14)*100,100)}%`}}/>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Phase 1</span><span>Phase 2 (4კვ)</span><span>Phase 3 (8კვ)</span><span>Phase 4 (14კვ)</span>
            </div>
          </div>
          <div className="card shadow-lg">
            <form onSubmit={handleCheckin} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  {k:'weight_kg',l:'წონა (კგ)',I:Scale,ph:'70.5',step:'0.1',min:20,max:300,hint:'დილით, უზმოზე'},
                  {k:'calories',l:'კალორიები (კკ)',I:Flame,ph:'2000',step:'50',min:500,max:10000,hint:'დღიური მოხმარება',full:true},
                  {k:'exercise_min',l:'ვარჯიში (წთ)',I:Dumbbell,ph:'45',step:'5',min:0,max:900,hint:'კვირის სულ'},
                  {k:'sleep_h',l:'ძილი (სთ)',I:Moon,ph:'7.5',step:'0.5',min:2,max:14,hint:'ღამის საშუალო'},
                  {k:'steps',l:'ნაბიჯები',I:Footprints,ph:'8000',step:'500',min:0,max:80000,hint:'დღიური საშუალო'},
                  {k:'stress',l:'სტრესი (1–40)',I:Brain,ph:'10',step:'1',min:1,max:40,hint:'1=მინ · 40=მაქს'},
                  {k:'hydration_l',l:'წყალი (ლ)',I:Droplets,ph:'2.0',step:'0.1',min:0.5,max:10,hint:'დღიური'},
                ].map(({k,l,I,ph,step,min,max,hint,full}:any) => (
                  <div key={k} className={full?'col-span-2':''}>
                    <label className="label flex items-center gap-1.5"><I size={13} className="text-primary-500"/>{l}</label>
                    <input type="number" step={step} min={min} max={max} className="input" placeholder={ph}
                      value={(checkin as any)[k]} onChange={e => setCheckin({...checkin,[k]:e.target.value})} required/>
                    <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
                  </div>
                ))}
              </div>
              <button type="submit" disabled={submitting} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {submitting?<><Loader2 size={16} className="animate-spin"/>გამოთვლა...</>:<><ChevronRight size={16}/>შენახვა და გამოთვლა</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* შედეგი */}
      {step==='result' && modelResult && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-display font-bold text-gray-900">დღის რაციონი</h1>
              <p className="text-sm text-gray-500">{dateStr}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-primary-600">{modelResult.tdee_kcal} კკ</div>
              <div className="text-xs text-gray-400">TDEE · Phase {modelResult.phase}</div>
            </div>
          </div>

          {dailyPlan && (
            <div className="card shadow-lg">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Clock size={15} className="text-primary-600"/>კვებების განაწილება · {dailyPlan.calories} კკ/დღე
              </h2>
              <div className="space-y-2">
                {dailyPlan.meals.map((m:any, i:number) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-20 text-sm font-medium text-gray-700">{m.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary-400 to-accent-400 rounded-full" style={{width:`${m.pct}%`}}/>
                    </div>
                    <div className="text-sm font-bold text-gray-800 w-20 text-right">{m.calories} კკ</div>
                    <div className="text-xs text-gray-400 w-8">{m.pct}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card shadow-lg">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle size={15} className="text-green-600"/>კალორიების რეკომენდაცია
              {modelResult.plateau_detected && <span className="text-xs text-yellow-600 flex items-center gap-1 ml-2"><AlertTriangle size={12}/>პლატო!</span>}
            </h2>
            {modelResult.phase===1 ? (
              <div className="bg-primary-50 border-2 border-primary-300 rounded-xl p-4 text-center mb-3">
                <div className="text-xs text-gray-500 mb-1">რეკომენდებული კალორიები</div>
                <div className="text-3xl font-bold text-primary-700">{modelResult.reg_rec}</div>
                <div className="text-xs text-gray-400 mt-1">კკ/დღე</div>
                <div className={clsx('text-sm font-semibold mt-2', modelResult.expected_dm_reg_kg<0?'text-blue-600':'text-green-600')}>
                  {modelResult.expected_dm_reg_kg>0?'+':''}{modelResult.expected_dm_reg_kg} კგ/თვ
                </div>
                <div className="mt-2 text-xs text-gray-400">Phase 2-ში (4 კვირის შემდეგ) 3 პერსონალიზებული რეკომენდაცია გამოჩნდება</div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[{l:'ცხიმის\nმოდელი',k:'fat_rec',dm:'expected_dm_fat_kg',c:'blue'},
                  {l:'კუნთის\nმოდელი',k:'mus_rec',dm:'expected_dm_mus_kg',c:'green'},
                  {l:'ML\nრეგრესია',k:'reg_rec',dm:'expected_dm_reg_kg',c:'purple'}].map(({l,k,dm,c}) => {
                  const val = modelResult[k]; const sel = selectedCalories===val;
                  return (
                    <button key={k} onClick={() => setSelectedCalories(val)}
                      className={clsx('rounded-xl p-3 text-center border-2 transition-all',
                        sel?`border-${c}-400 bg-${c}-50 shadow`:'border-gray-200 bg-white hover:border-gray-300')}>
                      <div className="text-[10px] text-gray-500 mb-1 whitespace-pre-line leading-tight">{l}</div>
                      <div className={clsx('text-2xl font-bold',c==='blue'?'text-blue-700':c==='green'?'text-green-700':'text-purple-700')}>{val}</div>
                      <div className="text-[10px] text-gray-400">კკ/დღე</div>
                      <div className={clsx('text-xs font-semibold mt-1',modelResult[dm]<0?'text-blue-600':'text-green-600')}>
                        {modelResult[dm]>0?'+':''}{modelResult[dm]} კგ/თვ
                      </div>
                      {sel && <CheckCircle size={14} className={clsx('mx-auto mt-1',c==='blue'?'text-blue-500':c==='green'?'text-green-500':'text-purple-500')}/>}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-500">{modelResult.message}</p>
            <button onClick={() => { setStep('checkin'); setCheckin({weight_kg:'',calories:'',exercise_min:'',sleep_h:'',steps:'',stress:'',hydration_l:''}); }}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <RefreshCw size={11}/>ახალი check-in
            </button>
          </div>

          <div className="card shadow-lg">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary-600"/>კალათის გენერაცია
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              არჩეული: <span className="font-bold text-primary-600">{selectedCalories} კკ/დღე</span>
            </p>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <button onClick={() => setShowFilter(!showFilter)} className="flex items-center gap-2 btn-secondary text-sm">
                <Filter size={14}/>ფილტრი
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={veganMode} onChange={e => setVeganMode(e.target.checked)} className="w-4 h-4 accent-green-500"/>
                <Leaf size={14} className="text-green-500"/>ვეგანური
              </label>
            </div>
            {showFilter && <div className="mb-3"><CategoryFilter categories={categories} excluded={excludedCats} onChange={setExcludedCats}/></div>}
            <button onClick={handleBasket} disabled={basketLoading||!selectedCalories} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {basketLoading?<><Loader2 size={16} className="animate-spin"/>გენერირება...</>:<><ShoppingCart size={16}/>კალათის გენერირება</>}
            </button>
          </div>

          {basket && basket.length>0 && (
            <div className="space-y-3">
              <BasketResults/>
              <button onClick={() => setShowRecipe(true)} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                🍳 რეცეპტების ნახვა
              </button>
            </div>
          )}
        </div>
      )}

      {showRecipe && basket && <RecipeModal basket={basket} totals={totals} onClose={() => setShowRecipe(false)}/>}
    </div>
  );
}
