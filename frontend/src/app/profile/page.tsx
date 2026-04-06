'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api, nutritionApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  User, Clock, TrendingDown, TrendingUp, Minus, Loader2, Shield,
  Activity, Scale, ChevronRight, Edit2, Check, X, Brain,
  Droplets, Info, Target, RefreshCw, AlertTriangle, CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const ACTIVITY_LABELS: Record<string, string> = {
  low:    'დაბალი — ოფისი, თითქმის არ მოძრაობ',
  medium: 'საშუალო — 7-10 ათასი ნაბიჯი ან კვირაში 2-3 ვარჯიში',
  high:   'მაღალი — ფიზიკური შრომა ან ყოველდღიური ვარჯიში',
};
const GOAL_LABELS: Record<string, string> = {
  lose:     '⬇️ წონის კლება',
  gain:     '⬆️ წონის მომატება',
  maintain: '➡️ შენარჩუნება',
};

const WEIGHT_TIP = `წონის ზუსტი კონტროლისთვის დაიცავით ეს მარტივი ფორმულა:

აიწონეთ კვირაში ერთხელ, დილით, უზმოზე, მას შემდეგ, რაც საპირფარეშოს გამოიყენებთ. სასწორი აუცილებლად მყარ, სწორ ზედაპირზე დადგით და აიწონეთ მსუბუქი სამოსით.

გახსოვდეთ, რომ ციფრების მცირე მერყეობა დღის განმავლობაში აბსოლუტურად ბუნებრივია და ძირითადად წყლის ბალანსს ან მიღებულ საკვებს უკავშირდება.`;

export default function ProfilePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showWeightTip, setShowWeightTip] = useState(false);
  const [nextCheckinDays, setNextCheckinDays] = useState<number | null>(null);

  const { register, handleSubmit, setValue, watch } = useForm<any>();
  const goal = watch('goal');

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    Promise.all([
      nutritionApi.history().catch(() => ({ data: { history: [] } })),
      api.get('/personalization/profile').catch(() => ({ data: { profile: null } })),
      api.get('/personalization/checkins').catch(() => ({ data: { checkins: [] } })),
    ]).then(([h, p, c]) => {
      setHistory(h.data.history || []);
      const prof = p.data.profile || null;
      setProfile(prof);
      setCheckins(c.data.checkins || []);
      if (prof) {
        setValue('gender', prof.gender);
        setValue('age', prof.age);
        setValue('weight_kg', prof.weight_kg);
        setValue('height_cm', prof.height_cm);
        setValue('activity_level', prof.activity_level);
        setValue('goal', prof.goal);
        setValue('target_weight_kg', prof.target_weight_kg);
      }
    }).finally(() => setLoading(false));

    // Checkin countdown
    api.get('/personalization/checkin/needed').then(({ data }) => {
      if (!data.needed && data.days_until) {
        setNextCheckinDays(data.days_until);
      } else if (data.needed) {
        setNextCheckinDays(0);
      }
    }).catch(() => {});
  }, [user]);

  const handleNameSave = async () => {
    if (!newName.trim()) return;
    try {
      await api.patch('/users/me', { name: newName.trim() });
      setEditingName(false);
      toast.success('სახელი განახლდა!');
      window.location.reload();
    } catch { toast.error('შეცდომა'); }
  };

  const handleProfileSave = async (data: any) => {
    setSavingProfile(true);
    try {
      const payload = {
        gender: data.gender,
        age: Number(data.age),
        weight_kg: Number(data.weight_kg),
        height_cm: Number(data.height_cm),
        activity_level: data.activity_level,
        goal: data.goal,
        target_weight_kg: data.target_weight_kg ? Number(data.target_weight_kg) : undefined,
        calorie_multiplier: profile?.calorie_multiplier || 1.0,
        vegan_mode: profile?.vegan_mode || false,
        eating_window: profile?.eating_window || 'standard',
        carb_sensitivity: profile?.carb_sensitivity || 'neutral',
        hunger_peak: profile?.hunger_peak || 'even',
      };
      await api.post('/personalization/calculate', payload);
      toast.success('პარამეტრები განახლდა! ✅');
      setEditingProfile(false);
      const { data: updated } = await api.get('/personalization/profile');
      setProfile(updated.profile);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    } finally { setSavingProfile(false); }
  };

  if (!user) return null;

  // ---- Chart data ----
  const weightData = checkins
    .filter(c => c.weight_kg)
    .sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime());

  const minW = weightData.length > 0 ? Math.min(...weightData.map(c => Number(c.weight_kg))) - 3 : 60;
  const maxW = weightData.length > 0 ? Math.max(...weightData.map(c => Number(c.weight_kg))) + 3 : 100;
  const rangeW = maxW - minW || 1;
  const chartW = Math.max(weightData.length * 80, 400);

  // ---- Progress analysis ----
  const analyzeProgress = () => {
    if (weightData.length < 2 || !profile) return null;
    const first = Number(weightData[0].weight_kg);
    const last  = Number(weightData[weightData.length - 1].weight_kg);
    const diff  = last - first;
    const target = Number(profile.target_weight_kg);
    const goal_type = profile.goal;

    let status: 'great' | 'ok' | 'warn' = 'ok';
    let message = '';
    let pct = 0;

    if (goal_type === 'lose') {
      if (diff < -0.3) { status = 'great'; message = `🔥 შესანიშნავი! ${Math.abs(diff).toFixed(1)} კგ დაიკლე — ასე გააგრძელე!`; }
      else if (diff > 0.3) { status = 'warn'; message = 'წონა იმატებს — შეამოწმე კვების გეგმა'; }
      else { status = 'ok'; message = 'წონა სტაბილურია — გაჩქარდი ოდნავ'; }
      if (target) pct = Math.min(100, Math.round((Math.abs(diff) / Math.abs(first - target)) * 100));
    } else if (goal_type === 'gain') {
      if (diff > 0.3) { status = 'great'; message = `💪 ბრავო! ${diff.toFixed(1)} კგ მოიმატე — სწორ გზაზე ხარ!`; }
      else if (diff < -0.3) { status = 'warn'; message = 'წონა იკლებს — გაზარდე კალორიები'; }
      else { status = 'ok'; message = 'წონა სტაბილურია — კარგადაა'; }
      if (target) pct = Math.min(100, Math.round((diff / Math.abs(target - first)) * 100));
    } else {
      if (Math.abs(diff) < 1) { status = 'great'; message = '✅ შესანიშნავი! წონა სტაბილურია — მიზანი მიღწეულია!'; }
      else { status = 'ok'; message = `მცირე ცვლილება: ${diff > 0 ? '+' : ''}${diff.toFixed(1)} კგ`; }
      pct = 100 - Math.min(100, Math.abs(diff) * 20);
    }
    return { status, message, pct, diff, first, last };
  };

  const analysis = analyzeProgress();

  const goalIcon = (g: string) => {
    if (g === 'lose') return { icon: TrendingDown, color: 'text-blue-600', bg: 'bg-blue-50' };
    if (g === 'gain') return { icon: TrendingUp,   color: 'text-green-600', bg: 'bg-green-50' };
    return { icon: Minus, color: 'text-gray-600', bg: 'bg-gray-50' };
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 animate-in">

      {/* ── User Card ── */}
      <div className="card bg-gradient-to-br from-white to-primary-50/30 border border-primary-100 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-400 to-accent-400 rounded-2xl flex items-center justify-center shadow shrink-0">
            <span className="text-white font-bold text-2xl">{user.name?.[0]?.toUpperCase() || 'U'}</span>
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input autoFocus className="input text-lg font-bold py-1"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNameSave()} />
                <button onClick={handleNameSave} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={16} /></button>
                <button onClick={() => setEditingName(false)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg"><X size={16} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-bold text-gray-900">{user.name}</h1>
                <button onClick={() => { setEditingName(true); setNewName(user.name || ''); }}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  <Edit2 size={13} />
                </button>
              </div>
            )}
            <p className="text-sm text-gray-400">{user.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(user.role === 'super_admin' || user.role === 'gym_admin') && (
                <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
                  <Shield size={12} /> ადმინ პანელი →
                </Link>
              )}
              {profile?.goal && (() => {
                const { icon: Icon, color } = goalIcon(profile.goal);
                return (
                  <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', color)}>
                    <Icon size={12} /> {GOAL_LABELS[profile.goal]}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Checkin countdown */}
      {nextCheckinDays !== null && (
        <div className={clsx(
          'flex items-center gap-3 p-3 rounded-xl border text-sm',
          nextCheckinDays === 0
            ? 'bg-primary-50 border-primary-200 text-primary-700'
            : 'bg-gray-50 border-gray-200 text-gray-600'
        )}>
          <Scale size={16} className={nextCheckinDays === 0 ? 'text-primary-600' : 'text-gray-400'} />
          {nextCheckinDays === 0 ? (
            <div>
              <span className="font-semibold">დროა ყოველკვირეული შემოწმებისთვის!</span>
              <Link href="/personalization" className="ml-2 text-xs text-primary-600 hover:underline">
                შემოწმება →
              </Link>
            </div>
          ) : (
            <div>
              <span>შემდეგი შემოწმება: </span>
              <span className="font-semibold">{nextCheckinDays} დღეში</span>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-400" size={28} /></div>
      ) : (
        <>
          {/* ── პარამეტრები / რედაქტირება ── */}
          {profile && (
            <div className="card shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Activity size={16} className="text-primary-600" /> ჩემი პარამეტრები
                </h2>
                <button
                  onClick={() => setEditingProfile(!editingProfile)}
                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border',
                    editingProfile
                      ? 'bg-gray-100 text-gray-600 border-gray-200'
                      : 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
                  )}>
                  {editingProfile ? <><X size={12} /> გაუქმება</> : <><Edit2 size={12} /> პარამეტრების განახლება</>}
                </button>
              </div>

              {!editingProfile ? (
                /* ── ნახვის რეჟიმი ── */
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'სიმაღლე',   val: profile.height_cm ? `${profile.height_cm} სმ` : '—' },
                    { label: 'წონა',       val: profile.weight_kg ? `${profile.weight_kg} კგ` : '—' },
                    { label: 'ასაკი',      val: profile.age ? `${profile.age} წ` : '—' },
                    { label: 'სქესი',      val: profile.gender === 'male' ? '♂ მამრ.' : profile.gender === 'female' ? '♀ მდედრ.' : '—' },
                    { label: 'სამიზნე',    val: profile.target_weight_kg ? `${profile.target_weight_kg} კგ` : '—' },
                    { label: 'აქტივობა',  val: profile.activity_level === 'low' ? 'დაბალი' : profile.activity_level === 'medium' ? 'საშუალო' : 'მაღალი' },
                    { label: 'მიზანი',     val: GOAL_LABELS[profile.goal] || '—' },
                    { label: 'კალ. მულტ.', val: profile.calorie_multiplier ? `×${profile.calorie_multiplier}` : '×1.0' },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="font-bold text-gray-800 text-sm">{val}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                /* ── რედაქტირების რეჟიმი ── */
                <form onSubmit={handleSubmit(handleProfileSave)} className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 flex items-start gap-2">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    პარამეტრების განახლებისას სისტემა ხელახლა გამოთვლის შენს კალორიებს და მაკრო ელემენტებს.
                  </div>

                  {/* სქესი */}
                  <div>
                    <label className="label">სქესი</label>
                    <div className="flex gap-2">
                      {[{ v:'male',l:'მამრობითი' },{ v:'female',l:'მდედრობითი' }].map(({ v, l }) => (
                        <label key={v} className="flex-1 cursor-pointer">
                          <input type="radio" value={v} {...register('gender')} className="peer sr-only" />
                          <div className="text-center py-2.5 rounded-xl border border-gray-200 text-sm font-medium transition-all peer-checked:border-primary-400 peer-checked:bg-primary-50 peer-checked:text-primary-700 text-gray-600">{l}</div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* ასაკი / სიმაღლე / წონა */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name:'age',       label:'ასაკი',        placeholder:'30' },
                      { name:'height_cm', label:'სიმაღლე (სმ)', placeholder:'175' },
                      { name:'weight_kg', label:'წონა (კგ)',     placeholder:'75' },
                    ].map(({ name, label, placeholder }) => (
                      <div key={name}>
                        <label className="label text-xs">{label}</label>
                        <div className="relative">
                          <input type="number" className="input text-sm py-2"
                            placeholder={placeholder} {...register(name)}
                            onFocus={() => name === 'weight_kg' && setShowWeightTip(true)} />
                          {name === 'weight_kg' && (
                            <button type="button"
                              onClick={() => setShowWeightTip(!showWeightTip)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600">
                              <Info size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* წონის tip */}
                  {showWeightTip && (
                    <div className="relative p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 leading-relaxed">
                      <button type="button"
                        onClick={() => setShowWeightTip(false)}
                        className="absolute top-2 right-2 text-blue-400 hover:text-blue-600">
                        <X size={16} />
                      </button>
                      <div className="font-semibold mb-2 flex items-center gap-2">
                        <Scale size={15} /> 💡 სწორი აწონვის ფორმულა
                      </div>
                      {WEIGHT_TIP.split('\n\n').map((para, i) => (
                        <p key={i} className="mb-2 last:mb-0">{para}</p>
                      ))}
                    </div>
                  )}

                  {/* აქტივობა */}
                  <div>
                    <label className="label">დღიური აქტივობა</label>
                    <div className="space-y-2">
                      {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
                        <label key={v} className="cursor-pointer">
                          <input type="radio" value={v} {...register('activity_level')} className="peer sr-only" />
                          <div className="p-2.5 rounded-xl border border-gray-100 text-sm transition-all peer-checked:border-primary-300 peer-checked:bg-primary-50 hover:border-gray-200 text-gray-700">{l}</div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* მიზანი */}
                  <div>
                    <label className="label">მიზანი</label>
                    <div className="space-y-2">
                      {[
                        { v:'lose',     l:'⬇️ წონის კლება',     info:'კვირაში სხეულის წონის 0.5-1%' },
                        { v:'gain',     l:'⬆️ წონის მომატება',  info:'თვეში 1-1.5 კგ' },
                        { v:'maintain', l:'➡️ შენარჩუნება',      info:'+/-1 კგ ვარიაცია ნორმალურია' },
                      ].map(({ v, l, info }) => (
                        <label key={v} className="cursor-pointer">
                          <input type="radio" value={v} {...register('goal')} className="peer sr-only" />
                          <div className={clsx(
                            'flex items-center justify-between p-3 rounded-xl border transition-all peer-checked:ring-2 peer-checked:ring-primary-400',
                            goal === v ? 'border-primary-300 bg-primary-50' : 'border-gray-100 hover:border-gray-200'
                          )}>
                            <span className="text-sm font-medium">{l}</span>
                            <span className="text-xs text-gray-400">{info}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {(goal === 'lose' || goal === 'gain') && (
                    <div>
                      <label className="label">სამიზნე წონა (კგ)</label>
                      <input type="number" className="input" placeholder="მაგ. 70" {...register('target_weight_kg')} />
                    </div>
                  )}

                  <button type="submit" disabled={savingProfile}
                    className="btn-primary w-full flex items-center justify-center gap-2">
                    {savingProfile
                      ? <><Loader2 size={15} className="animate-spin" /> ინახება...</>
                      : <><RefreshCw size={15} /> პარამეტრების განახლება</>}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── პროგრესის ანალიზი ── */}
          {analysis && (
            <div className={clsx(
              'card border-2 shadow-lg',
              analysis.status === 'great' ? 'border-green-200 bg-green-50/50' :
              analysis.status === 'warn'  ? 'border-yellow-200 bg-yellow-50/50' :
                                            'border-blue-200 bg-blue-50/50'
            )}>
              <div className="flex items-center gap-3 mb-3">
                {analysis.status === 'great'
                  ? <CheckCircle size={20} className="text-green-600" />
                  : analysis.status === 'warn'
                  ? <AlertTriangle size={20} className="text-yellow-600" />
                  : <Target size={20} className="text-blue-600" />}
                <div>
                  <h3 className="font-semibold text-gray-900">პროგრესის ანალიზი</h3>
                  <p className={clsx('text-sm',
                    analysis.status === 'great' ? 'text-green-700' :
                    analysis.status === 'warn'  ? 'text-yellow-700' : 'text-blue-700'
                  )}>{analysis.message}</p>
                </div>
              </div>

              {profile?.target_weight_kg && analysis.pct > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>დაწყება: {analysis.first} კგ</span>
                    <span>სამიზნე: {profile.target_weight_kg} კგ</span>
                  </div>
                  <div className="h-3 bg-white rounded-full overflow-hidden border border-gray-200">
                    <div
                      className={clsx('h-full rounded-full transition-all',
                        analysis.status === 'great' ? 'bg-green-400' :
                        analysis.status === 'warn'  ? 'bg-yellow-400' : 'bg-blue-400'
                      )}
                      style={{ width: `${Math.max(analysis.pct, 2)}%` }}
                    />
                  </div>
                  <div className="text-right text-xs text-gray-400 mt-1">{analysis.pct}% სამიზნემდე</div>
                </div>
              )}

              {/* კვირეული სტატისტიკა */}
              {checkins.length >= 2 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: 'ჩაწერა', val: checkins.length },
                    { label: 'საწყისი', val: `${analysis.first} კგ` },
                    { label: 'მიმდინარე', val: `${analysis.last} კგ` },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-white/70 rounded-xl p-2 text-center">
                      <div className="font-bold text-gray-800 text-sm">{val}</div>
                      <div className="text-xs text-gray-400">{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── წონის დინამიკის გრაფიკი ── */}
          {weightData.length >= 2 && (
            <div className="card shadow-lg">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Scale size={16} className="text-primary-600" /> წონის დინამიკა
              </h2>
              <div className="overflow-x-auto pb-2">
                <svg width={chartW} height={160} viewBox={`0 0 ${chartW} 160`}
                  style={{ minWidth: '100%' }}>
                  {/* Grid */}
                  {[0, 0.25, 0.5, 0.75, 1].map(f => (
                    <g key={f}>
                      <line x1="30" x2={chartW - 10} y1={20 + f * 100} y2={20 + f * 100}
                        stroke="#f3f4f6" strokeWidth="1" />
                      <text x="25" y={24 + f * 100} textAnchor="end" fontSize="8" fill="#9ca3af">
                        {(maxW - f * rangeW).toFixed(1)}
                      </text>
                    </g>
                  ))}

                  {/* Target line */}
                  {profile?.target_weight_kg && (() => {
                    const ty = 20 + (1 - (Number(profile.target_weight_kg) - minW) / rangeW) * 100;
                    if (ty < 15 || ty > 125) return null;
                    return (
                      <g>
                        <line x1="30" x2={chartW - 10} y1={ty} y2={ty}
                          stroke="#6366f1" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />
                        <text x={chartW - 8} y={ty - 3} textAnchor="end" fontSize="8" fill="#6366f1">
                          სამიზნე {profile.target_weight_kg}კგ
                        </text>
                      </g>
                    );
                  })()}

                  {/* Area fill */}
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {weightData.length > 1 && (() => {
                    const pts = weightData.map((c, i) => {
                      const x = 30 + (i / (weightData.length - 1)) * (chartW - 50);
                      const y = 20 + (1 - (Number(c.weight_kg) - minW) / rangeW) * 100;
                      return [x, y];
                    });
                    const pathD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
                    const areaD = pathD + ` L ${pts[pts.length-1][0]} 120 L ${pts[0][0]} 120 Z`;
                    return <path d={areaD} fill="url(#areaGrad)" />;
                  })()}

                  {/* Line */}
                  <polyline
                    fill="none" stroke="#6366f1" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    points={weightData.map((c, i) => {
                      const x = 30 + (i / (weightData.length - 1)) * (chartW - 50);
                      const y = 20 + (1 - (Number(c.weight_kg) - minW) / rangeW) * 100;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* Dots + labels */}
                  {weightData.map((c, i) => {
                    const x = 30 + (i / (weightData.length - 1)) * (chartW - 50);
                    const y = 20 + (1 - (Number(c.weight_kg) - minW) / rangeW) * 100;
                    const isLast = i === weightData.length - 1;
                    return (
                      <g key={i}>
                        <circle cx={x} cy={y} r={isLast ? 6 : 4}
                          fill="white" stroke="#6366f1" strokeWidth="2.5" />
                        {isLast && <circle cx={x} cy={y} r="3" fill="#6366f1" />}
                        <text x={x} y={y - 10} textAnchor="middle" fontSize="9"
                          fill={isLast ? '#4f46e5' : '#6366f1'} fontWeight={isLast ? '700' : '500'}>
                          {c.weight_kg}კგ
                        </text>
                        <text x={x} y={148} textAnchor="middle" fontSize="8" fill="#9ca3af">
                          {new Date(c.checked_at).toLocaleDateString('ka-GE', { day:'numeric', month:'short' })}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* ── კალორიების ისტორია ── */}
          {history.length >= 2 && (
            <div className="card shadow-lg">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Brain size={16} className="text-accent-600" /> კალორიების ცვლილება
              </h2>
              <div className="flex items-end gap-1.5 h-32">
                {history.slice(-14).map((h: any, i: number) => {
                  const maxCal = Math.max(...history.slice(-14).map((x: any) => x.adjusted_calories));
                  const pct = (h.adjusted_calories / maxCal) * 100;
                  const isLast = i === Math.min(history.length, 14) - 1;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group">
                      <span className="text-[9px] text-primary-600 font-medium opacity-0 group-hover:opacity-100 transition">
                        {h.adjusted_calories}
                      </span>
                      <div
                        className={clsx(
                          'w-full rounded-t-lg transition-all cursor-default',
                          isLast ? 'bg-primary-500' : 'bg-primary-200 hover:bg-primary-400'
                        )}
                        style={{ height: `${pct}%` }}
                      />
                      <div className="text-[8px] text-gray-400 hidden sm:block rotate-0 whitespace-nowrap overflow-hidden w-full text-center">
                        {new Date(h.calculated_at).toLocaleDateString('ka-GE', { day:'numeric', month:'short' })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>უძველესი</span>
                <span>უახლესი</span>
              </div>
            </div>
          )}

          {/* ── კვების ისტორია ── */}
          <div className="card shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock size={16} className="text-primary-600" /> კვების ისტორია
              </h2>
              <span className="text-xs text-gray-400">{history.length} ჩანაწერი</span>
            </div>
            {history.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <p>ჯერ გათვლები არ გაქვთ.</p>
                <Link href="/personalization" className="text-primary-600 hover:underline mt-1 block">
                  პერსონალიზაციაზე გადასვლა →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((h: any) => (
                  <div key={h.id} className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition">
                    <div className="text-xs text-gray-400 w-24 shrink-0">
                      {new Date(h.calculated_at).toLocaleDateString('ka-GE')}
                    </div>
                    <div className="flex items-center gap-3 flex-1 flex-wrap text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">{h.adjusted_calories} კკალ</span>
                      <span>ც:{h.protein}გ</span>
                      <span>ცხ:{h.fat}გ</span>
                      <span>ნ:{h.carbs}გ</span>
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">BMI {h.bmi}</div>
                    {h.timeline && (
                      <div className="text-xs text-primary-600 shrink-0">{h.timeline}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-center">
            <Link href="/personalization" className="btn-primary inline-block text-sm">
              პერსონალიზაციაზე გადასვლა
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
