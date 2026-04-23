'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  Scale, Flame, Dumbbell, Moon, Footprints, Brain, Droplets,
  ChevronRight, Loader2, RefreshCw, AlertTriangle, CheckCircle,
  TrendingDown, TrendingUp, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

export default function CheckinPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [latestResult, setLatestResult] = useState<any>(null);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [hasProfile, setHasProfile] = useState(true);

  const [form, setForm] = useState({
    weight_kg: '',
    calories: '',
    exercise_min: '',
    sleep_h: '',
    steps: '',
    stress: '',
    hydration_l: '',
    goal: 'loss',
    aggressiveness: 'moderate',
    // პროფილის ველები (თუ user_profiles-ში არ არის)
    sex: '1',
    age: '',
    height_cm: '',
  });

  const [profileExists, setProfileExists] = useState(false);

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }

    api.get('/checkin/latest').then(({ data }) => {
      setLatestResult(data.result);
      setTotalCheckins(data.total_checkins || 0);
    }).catch(() => {});

    api.get('/checkin/history').then(({ data }) => {
      setHistory(data.checkins || []);
    }).catch(() => {});

    // პროფილი შევამოწმოთ
    api.get('/personalization/profile').then(({ data }) => {
      if (data.profile && data.profile.age && data.profile.height_cm) {
        setProfileExists(true);
        setForm(prev => ({
          ...prev,
          sex: String(data.profile.gender === 'female' ? 0 : 1),
          age: String(data.profile.age),
          height_cm: String(data.profile.height_cm),
        }));
      }
    }).catch(() => {});
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.age || !form.height_cm) {
      toast.error('ასაკი და სიმაღლე სავალდებულოა');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        week:           totalCheckins,
        weight_kg:      parseFloat(form.weight_kg),
        calories:       parseInt(form.calories),
        exercise_min:   parseInt(form.exercise_min),
        sleep_h:        parseFloat(form.sleep_h),
        steps:          parseInt(form.steps),
        stress:         parseInt(form.stress),
        hydration_l:    parseFloat(form.hydration_l),
        goal:           form.goal,
        aggressiveness: form.aggressiveness,
        sex:            parseInt(form.sex),
        age:            parseInt(form.age),
        height_cm:      parseFloat(form.height_cm),
      };

      const { data } = await api.post('/checkin', payload);
      setResult(data.result);
      setTotalCheckins(data.total_checkins);
      setSubmitted(true);
      toast.success('✅ Check-in შენახულია!');
      const { data: hist } = await api.get('/checkin/history');
      setHistory(hist.checkins || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const phase = latestResult?.phase || 1;
  const progressPct = Math.min((totalCheckins / 14) * 100, 100);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-in">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900">
          კვირეული Check-in
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          კვირა #{totalCheckins} ·{' '}
          {totalCheckins < 4
            ? `კიდევ ${4 - totalCheckins} კვირა Phase 2 მოდელამდე`
            : totalCheckins < 8
            ? `Phase 2 აქტიურია · კიდევ ${8 - totalCheckins} კვ. Phase 3-მდე`
            : totalCheckins < 14
            ? `Phase 3 აქტიურია · კიდევ ${14 - totalCheckins} კვ. Phase 4-მდე`
            : 'Phase 4 — Kalman Filter ✅'}
        </p>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary-400 to-accent-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>Phase 1</span>
          <span>Phase 2 (4კვ)</span>
          <span>Phase 3 (8კვ)</span>
          <span>Phase 4 (14კვ)</span>
        </div>
      </div>

      {/* ბოლო შედეგი */}
      {latestResult && !submitted && (
        <ResultCard result={latestResult} />
      )}

      {/* ფორმა */}
      {!submitted ? (
        <div className="card shadow-lg">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <RefreshCw size={16} className="text-primary-600" />
            კვირა #{totalCheckins} — მონაცემები
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* მიზანი + ტემპი */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">მიზანი</label>
                <select className="input" value={form.goal}
                  onChange={e => setForm({...form, goal: e.target.value})}>
                  <option value="loss">⬇️ წონის კლება</option>
                  <option value="gain">⬆️ წონის მომატება</option>
                  <option value="maintain">➡️ შენარჩუნება</option>
                  <option value="recomp">🔄 რეკომპოზიცია</option>
                </select>
              </div>
              <div>
                <label className="label">ტემპი</label>
                <select className="input" value={form.aggressiveness}
                  onChange={e => setForm({...form, aggressiveness: e.target.value})}>
                  <option value="conservative">🐢 კონსერვატული</option>
                  <option value="moderate">⚖️ ზომიერი</option>
                  <option value="aggressive">🔥 აგრესიული</option>
                </select>
              </div>
            </div>

            {/* პროფილის ველები */}
            {!profileExists && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-xs text-blue-700 font-medium mb-3 flex items-center gap-1">
                  <Info size={13}/> პირადი მონაცემები (მოდელისთვის საჭირო)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label text-xs">სქესი</label>
                    <select className="input text-sm" value={form.sex}
                      onChange={e => setForm({...form, sex: e.target.value})}>
                      <option value="1">♂ მამრ.</option>
                      <option value="0">♀ მდედრ.</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">ასაკი</label>
                    <input type="number" className="input text-sm" placeholder="25"
                      min="16" max="100" value={form.age}
                      onChange={e => setForm({...form, age: e.target.value})} required />
                  </div>
                  <div>
                    <label className="label text-xs">სიმაღლე (სმ)</label>
                    <input type="number" className="input text-sm" placeholder="170"
                      min="100" max="250" value={form.height_cm}
                      onChange={e => setForm({...form, height_cm: e.target.value})} required />
                  </div>
                </div>
              </div>
            )}

            {/* კვირეული მონაცემები */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { key:'weight_kg', label:'წონა (კგ)', icon:Scale, ph:'70.5', step:'0.1', min:20, max:300, hint:'დილით, უზმოზე' },
                { key:'calories', label:'კალორიები (კკ)', icon:Flame, ph:'2000', step:'50', min:500, max:10000, hint:'დღიური მოხმარება', full:true },
                { key:'exercise_min', label:'ვარჯიში (წუთი)', icon:Dumbbell, ph:'45', step:'5', min:0, max:900, hint:'კვირის სულ' },
                { key:'sleep_h', label:'ძილი (სთ)', icon:Moon, ph:'7.5', step:'0.5', min:2, max:14, hint:'ღამის საშუალო' },
                { key:'steps', label:'ნაბიჯები', icon:Footprints, ph:'8000', step:'500', min:0, max:80000, hint:'დღიური საშუალო' },
                { key:'stress', label:'სტრესი (1–40)', icon:Brain, ph:'10', step:'1', min:1, max:40, hint:'1=მინ · 40=მაქს' },
                { key:'hydration_l', label:'წყალი (ლ)', icon:Droplets, ph:'2.0', step:'0.1', min:0.5, max:10, hint:'დღიური მოხმარება' },
              ].map(({ key, label, icon:Icon, ph, step, min, max, hint, full }) => (
                <div key={key} className={full ? 'col-span-2' : ''}>
                  <label className="label flex items-center gap-1.5">
                    <Icon size={13} className="text-primary-500" /> {label}
                  </label>
                  <input type="number" step={step} min={min} max={max}
                    className="input" placeholder={ph}
                    value={(form as any)[key]}
                    onChange={e => setForm({...form, [key]: e.target.value})}
                    required />
                  <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
                </div>
              ))}
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> გამოთვლა...</>
                : <><ChevronRight size={16} /> Check-in შენახვა</>}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          {result && <ResultCard result={result} />}
          <button onClick={() => {
            setSubmitted(false); setResult(null);
            setForm(prev => ({...prev,
              weight_kg:'', calories:'', exercise_min:'',
              sleep_h:'', steps:'', stress:'', hydration_l:''}));
          }} className="btn-secondary w-full">
            ახალი Check-in
          </button>
        </div>
      )}

      {/* ისტორია */}
      {history.length > 0 && (
        <div className="card shadow-lg">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Scale size={15} className="text-primary-600"/> Check-in ისტორია
          </h2>
          <div className="space-y-1.5">
            {history.slice(0, 8).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl text-xs">
                <span className="font-semibold text-gray-500 w-14 shrink-0">კვ. #{c.week}</span>
                <span className="font-bold text-gray-900">{c.weight_kg} კგ</span>
                <span className="text-gray-500">{c.calories} კკ</span>
                <span className="text-gray-400 ml-auto">
                  {new Date(c.recorded_at).toLocaleDateString('ka-GE')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: any }) {
  if (!result) return null;
  const phase = result.phase || 1;
  const plateau = result.plateau_detected;
  const dietBreak = result.diet_break_suggested;

  return (
    <div className={clsx('card border-2 shadow-lg space-y-4',
      plateau ? 'border-yellow-300 bg-yellow-50/40'
      : dietBreak ? 'border-orange-200 bg-orange-50/30'
      : 'border-primary-100 bg-white')}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            {plateau
              ? <AlertTriangle size={16} className="text-yellow-600"/>
              : <CheckCircle size={16} className="text-green-600"/>}
            <h3 className="font-semibold text-gray-900">
              {plateau ? 'პლატო აღმოჩენილია' : 'მოდელის შედეგი'}
            </h3>
          </div>
          <p className="text-xs text-gray-500">Phase {phase} · {result.message}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-primary-600">{result.tdee_kcal}</div>
          <div className="text-xs text-gray-400">კკ/დღე TDEE</div>
        </div>
      </div>

      {/* 3 რეკომენდაცია */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label:'ცხიმი\n(7700კკ/კგ)', key:'fat_rec', dm:'expected_dm_fat_kg',
            color:'bg-blue-50 text-blue-800 border-blue-200' },
          { label:'კუნთი\n(950კკ/კგ)', key:'mus_rec', dm:'expected_dm_mus_kg',
            color:'bg-green-50 text-green-800 border-green-200' },
          { label:'რეგრ.\n(ML)', key:'reg_rec', dm:'expected_dm_reg_kg',
            color:'bg-purple-50 text-purple-800 border-purple-200' },
        ].map(({ label, key, dm, color }) => (
          <div key={key} className={clsx('rounded-xl p-3 text-center border', color)}>
            <div className="text-[10px] font-medium opacity-60 mb-1 whitespace-pre-line leading-tight">{label}</div>
            <div className="text-xl font-bold">{result[key]}</div>
            <div className="text-[10px] opacity-60">კკ/დღე</div>
            <div className={clsx('text-xs font-semibold mt-1',
              result[dm] < 0 ? 'text-blue-600' : 'text-green-600')}>
              {result[dm] > 0 ? '+' : ''}{result[dm]} კგ/თვ
            </div>
          </div>
        ))}
      </div>

      {/* დეტალები */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label:'ადაპტაცია', val:`×${Number(result.adaptation_factor || 1).toFixed(3)}` },
          { label:'λ (lambda)', val:Number(result.lambda_i || 1).toFixed(3) },
          { label:'დეფ. კვირები', val:`${result.deficit_weeks || 0} კვ` },
          { label:'AR(1) ρ', val:result.rho_ar1 ? Number(result.rho_ar1).toFixed(3) : '—' },
        ].map(({ label, val }) => (
          <div key={label} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 text-xs">
            <span className="text-gray-500">{label}</span>
            <span className="font-semibold text-gray-800">{val}</span>
          </div>
        ))}
      </div>

      {dietBreak && !plateau && (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-800 flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
          <span>💡 Diet break რეკომენდებულია — 1-2 კვირა TDEE-ზე ჭამა მეტაბოლიზმს განაახლებს.</span>
        </div>
      )}

      {plateau && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800 flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
          <span>⚠️ პლატო! 1-2 კვირა TDEE-ზე ჭამა (diet break) რეკომენდებულია.</span>
        </div>
      )}
    </div>
  );
}
