'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  Scale, Flame, Dumbbell, Moon, Footprints, Brain, Droplets,
  ChevronRight, Loader2, CheckCircle, AlertTriangle, TrendingDown,
  TrendingUp, Minus, Info, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const GOAL_LABELS: Record<string, string> = {
  loss: '⬇️ წონის კლება', gain: '⬆️ წონის მომატება',
  maintain: '➡️ შენარჩუნება', recomp: '🔄 რეკომპოზიცია',
};
const AGGR_LABELS: Record<string, string> = {
  conservative: '🐢 კონსერვატული', moderate: '⚖️ ზომიერი', aggressive: '🔥 აგრესიული',
};

export default function CheckinPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [latestResult, setLatestResult] = useState<any>(null);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [form, setForm] = useState({
    week: 0,
    weight_kg: '',
    calories: '',
    exercise_min: '',
    sleep_h: '',
    steps: '',
    stress: '',
    hydration_l: '',
    goal: 'loss',
    aggressiveness: 'moderate',
  });

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    // ბოლო შედეგი
    api.get('/checkin/latest').then(({ data }) => {
      setLatestResult(data.result);
      setTotalCheckins(data.total_checkins || 0);
      setForm(prev => ({ ...prev, week: data.total_checkins }));
    }).catch(() => {});
    // ისტორია
    api.get('/checkin/history').then(({ data }) => {
      setHistory(data.checkins || []);
    }).catch(() => {});
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        week:         Number(form.week),
        weight_kg:    parseFloat(form.weight_kg),
        calories:     parseInt(form.calories),
        exercise_min: parseInt(form.exercise_min),
        sleep_h:      parseFloat(form.sleep_h),
        steps:        parseInt(form.steps),
        stress:       parseInt(form.stress),
        hydration_l:  parseFloat(form.hydration_l),
        goal:         form.goal,
        aggressiveness: form.aggressiveness,
      };
      const { data } = await api.post('/checkin', payload);
      setResult(data.result);
      setTotalCheckins(data.total_checkins);
      setSubmitted(true);
      toast.success('✅ Check-in შენახულია!');
      // ისტორია განახლება
      const { data: hist } = await api.get('/checkin/history');
      setHistory(hist.checkins || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const fields = [
    { key: 'weight_kg', label: 'წონა (კგ)', icon: Scale, placeholder: '70.5', step: '0.1', min: 20, max: 300, type: 'number', hint: 'დილით, უზმოზე' },
    { key: 'calories', label: 'კალორიები (კკ)', icon: Flame, placeholder: '2000', step: '1', min: 500, max: 10000, type: 'number', hint: 'დღის განმავლობაში შეჭამა' },
    { key: 'exercise_min', label: 'ვარჯიში (წუთი)', icon: Dumbbell, placeholder: '45', step: '1', min: 0, max: 900, type: 'number', hint: 'კვირის განმავლობაში' },
    { key: 'sleep_h', label: 'ძილი (საათი)', icon: Moon, placeholder: '7.5', step: '0.5', min: 2, max: 14, type: 'number', hint: 'ღამის ძილის საშუალო' },
    { key: 'steps', label: 'ნაბიჯები', icon: Footprints, placeholder: '8000', step: '100', min: 0, max: 80000, type: 'number', hint: 'დღიური საშუალო' },
    { key: 'stress', label: 'სტრესი (1-40)', icon: Brain, placeholder: '10', step: '1', min: 1, max: 40, type: 'number', hint: '1=მინ, 40=მაქს' },
    { key: 'hydration_l', label: 'წყალი (ლიტრი)', icon: Droplets, placeholder: '2.0', step: '0.1', min: 0.5, max: 10, type: 'number', hint: 'დღიური მოხმარება' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900">კვირეული Check-in</h1>
        <p className="text-sm text-gray-500 mt-1">
          კვირა #{totalCheckins} · {totalCheckins < 4
            ? `კიდევ ${4 - totalCheckins} კვ. Phase 2 მოდელამდე`
            : `Phase ${totalCheckins >= 14 ? 4 : totalCheckins >= 8 ? 3 : 2} აქტიურია`}
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-primary-400 to-accent-400 rounded-full transition-all"
          style={{ width: `${Math.min((totalCheckins / 14) * 100, 100)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>Phase 1</span><span>Phase 2 (4კვ)</span>
        <span>Phase 3 (8კვ)</span><span>Phase 4 (14კვ)</span>
      </div>

      {/* ბოლო შედეგი */}
      {latestResult && !submitted && (
        <ResultCard result={latestResult} />
      )}

      {/* ახალი check-in ფორმა */}
      {!submitted ? (
        <div className="card shadow-lg">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <RefreshCw size={16} className="text-primary-600" />
            კვირა #{totalCheckins} მონაცემები
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* მიზანი */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">მიზანი</label>
                <select className="input" value={form.goal}
                  onChange={e => setForm({...form, goal: e.target.value})}>
                  {Object.entries(GOAL_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">ტემპი</label>
                <select className="input" value={form.aggressiveness}
                  onChange={e => setForm({...form, aggressiveness: e.target.value})}>
                  {Object.entries(AGGR_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ველები */}
            <div className="grid grid-cols-2 gap-3">
              {fields.map(({ key, label, icon: Icon, placeholder, step, min, max, hint }) => (
                <div key={key} className={key === 'calories' ? 'col-span-2' : ''}>
                  <label className="label flex items-center gap-1.5">
                    <Icon size={13} className="text-primary-600" /> {label}
                  </label>
                  <input
                    type="number" step={step} min={min} max={max}
                    className="input" placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={e => setForm({...form, [key]: e.target.value})}
                    required
                  />
                  <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
                </div>
              ))}
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> გამოთვლა...</>
                : <><ChevronRight size={15} /> Check-in შენახვა</>}
            </button>
          </form>
        </div>
      ) : (
        /* შედეგი */
        <div className="space-y-4">
          {result && <ResultCard result={result} />}
          <button onClick={() => {
            setSubmitted(false);
            setResult(null);
            setForm(prev => ({...prev, week: totalCheckins,
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
          <h2 className="font-semibold text-gray-900 mb-3">Check-in ისტორია</h2>
          <div className="space-y-2">
            {history.slice(0, 8).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl text-xs">
                <span className="font-medium text-gray-600 w-14">კვ. #{c.week}</span>
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
  const phase = result?.phase || 1;
  const plateau = result?.plateau_detected;

  return (
    <div className={clsx('card border-2 shadow-lg space-y-4',
      plateau ? 'border-yellow-200 bg-yellow-50/30' : 'border-primary-100')}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">
            {plateau ? '⚠️ პლატო' : '✅ მოდელის შედეგი'}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Phase {phase} · {result?.message}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-primary-600">{result?.tdee_kcal}</div>
          <div className="text-xs text-gray-400">კკ/დღე TDEE</div>
        </div>
      </div>

      {/* 3 რეკომენდაცია */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'ცხიმი', key: 'fat_rec', color: 'bg-blue-50 text-blue-700', dm: 'expected_dm_fat_kg' },
          { label: 'კუნთი', key: 'mus_rec', color: 'bg-green-50 text-green-700', dm: 'expected_dm_mus_kg' },
          { label: 'რეგრ.', key: 'reg_rec', color: 'bg-purple-50 text-purple-700', dm: 'expected_dm_reg_kg' },
        ].map(({ label, key, color, dm }) => (
          <div key={key} className={clsx('rounded-xl p-3 text-center', color)}>
            <div className="text-xs font-medium opacity-70 mb-1">{label}</div>
            <div className="text-xl font-bold">{result?.[key]}</div>
            <div className="text-xs opacity-70">კკ/დღე</div>
            <div className="text-xs mt-1 font-medium">
              {result?.[dm] > 0 ? '+' : ''}{result?.[dm]} კგ/თვ
            </div>
          </div>
        ))}
      </div>

      {/* დამატებითი ინფო */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          { label: 'ადაპტაცია', val: `×${result?.adaptation_factor?.toFixed(3)}` },
          { label: 'λ (lambda)', val: result?.lambda_i?.toFixed(3) },
          { label: 'დეფ. კვირები', val: result?.deficit_weeks || 0 },
          { label: 'AR(1) ρ', val: result?.rho_ar1?.toFixed(3) || '—' },
        ].map(({ label, val }) => (
          <div key={label} className="bg-gray-50 rounded-lg px-3 py-2 flex justify-between">
            <span className="text-gray-500">{label}</span>
            <span className="font-medium text-gray-800">{val}</span>
          </div>
        ))}
      </div>

      {result?.diet_break_suggested && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800">
          💡 Diet break რეკომენდებულია — 1-2 კვირა TDEE-ზე ჭამა მეტაბოლიზმს განაახლებს.
        </div>
      )}
    </div>
  );
}
