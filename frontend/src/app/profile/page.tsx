'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, Timer, Pencil, Check, RefreshCw, Scale, Target } from 'lucide-react';
import Link from 'next/link';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const GOAL_LABELS: Record<string,string> = { loss:'⬇️ კლება', maintain:'➡️ შენარჩუნება', gain:'⬆️ მომატება', lose:'⬇️ კლება' };
const AGGR_LABELS: Record<string,string> = { conservative:'🐢 ნელი', moderate:'⚖️ ზომიერი', aggressive:'🔥 სწრაფი' };
const HUNGER_LABELS: Record<string,string> = { morning:'🌅 დილით', noon:'☀️ შუადღით', evening:'🌙 საღამოს', even:'⚖️ თანაბრად' };
const EATING_LABELS: Record<string,string> = { home:'🏠 სახლში', standard:'🏠+💼 სახლი+სამსახური', outside:'🌍 გარეთ' };

export default function ProfilePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [checkins, setCheckins] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [daysUntil, setDaysUntil] = useState<number|null>(null);
  const [hoursUntil, setHoursUntil] = useState<number|null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ef, setEf] = useState({ gender:'male', age:'', height_cm:'', weight_kg:'', target_weight_kg:'', goal:'loss', aggressiveness:'moderate', hunger_peak:'even', eating_window:'standard' });

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    Promise.all([
      api.get('/checkin/history').catch(() => ({ data:{checkins:[],results:[]} })),
      api.get('/personalization/profile').catch(() => ({ data:{profile:null} })),
    ]).then(([h, p]) => {
      const c = h.data.checkins||[];
      setCheckins(c); setResults(h.data.results||[]);
      const prof = p.data.profile;
      if (prof) {
        setProfile(prof);
        setEf({ gender:prof.gender||'male', age:String(prof.age||''), height_cm:String(prof.height_cm||''),
          weight_kg:String(prof.weight_kg||''), target_weight_kg:String(prof.target_weight_kg||''),
          goal:prof.goal==='lose'?'loss':prof.goal||'loss', aggressiveness:prof.aggressiveness||'moderate',
          hunger_peak:prof.hunger_peak||'even', eating_window:prof.eating_window||'standard' });
      }
      if (c.length > 0) {
        const diff = new Date(c[0].recorded_at).getTime()+7*24*60*60*1000 - Date.now();
        if (diff > 0) { setDaysUntil(Math.floor(diff/86400000)); setHoursUntil(Math.floor((diff%86400000)/3600000)); }
        else { setDaysUntil(0); setHoursUntil(0); }
      }
    }).finally(() => setLoading(false));
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/personalization/calculate', {
        gender:ef.gender, age:parseInt(ef.age), height_cm:parseFloat(ef.height_cm),
        weight_kg:parseFloat(ef.weight_kg), activity_level:'medium',
        goal:ef.goal==='loss'?'lose':ef.goal,
        target_weight_kg:parseFloat(ef.target_weight_kg||ef.weight_kg),
        eating_window:ef.eating_window, carb_sensitivity:'neutral', hunger_peak:ef.hunger_peak, vegan_mode:false,
      });
      setProfile({...profile,...ef}); setEditing(false);
      toast.success('✅ პროფილი განახლდა!');
    } catch (err:any) { toast.error(err.response?.data?.error||'შეცდომა'); }
    finally { setSaving(false); }
  };

  if (!user) return null;
  const latestResult = results[0];
  const weightData = [...checkins].reverse().map(c => ({ week:`კვ.${c.week}`, w:parseFloat(c.weight_kg) }));
  const maxW = Math.max(...weightData.map(d=>d.w), 0);
  const minW = Math.min(...weightData.map(d=>d.w), 999);
  const wRange = maxW-minW||1;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div className="card flex items-center gap-4 shadow-sm">
        <div className="w-14 h-14 bg-gradient-to-br from-primary-400 to-accent-400 rounded-2xl flex items-center justify-center shadow shrink-0">
          <span className="text-white font-bold text-2xl">{user.name?.[0]?.toUpperCase()||'U'}</span>
        </div>
        <div><h1 className="font-display text-xl font-bold text-gray-900">{user.name}</h1>
          <p className="text-sm text-gray-400">{user.email}</p></div>
      </div>

      {daysUntil !== null && (
        <div className={clsx('card shadow-sm border-2', daysUntil===0?'border-green-300 bg-green-50':'border-primary-100')}>
          <div className="flex items-center gap-3">
            <Timer size={20} className={daysUntil===0?'text-green-600':'text-primary-600'}/>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-sm">{daysUntil===0?'✅ Check-in მზადაა!':'შემდეგი Check-in'}</h3>
              <p className="text-xs text-gray-500">{daysUntil===0?'ახლა შეგიძლიათ check-in გაიაროთ':`${daysUntil} დღე ${hoursUntil} საათი`}</p>
            </div>
            {daysUntil===0 && <Link href="/personalization" className="btn-primary text-sm py-1.5 px-3">Check-in →</Link>}
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary-400"/></div> : (
        <>
          <div className="card shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Target size={15} className="text-primary-600"/>ჩემი პარამეტრები</h2>
              {!editing ? (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm text-primary-600 font-medium"><Pencil size={14}/>რედაქტირება</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium">
                    {saving?<Loader2 size={12} className="animate-spin"/>:<Check size={12}/>} შენახვა
                  </button>
                  <button onClick={() => setEditing(false)} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">გაუქმება</button>
                </div>
              )}
            </div>
            {!editing ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  {l:'სქესი', v:profile?.gender==='male'?'♂ მამრობითი':'♀ მდედრობითი'},
                  {l:'ასაკი', v:profile?.age?`${profile.age} წელი`:'—'},
                  {l:'სიმაღლე', v:profile?.height_cm?`${profile.height_cm} სმ`:'—'},
                  {l:'ამჟ. წონა', v:profile?.weight_kg?`${profile.weight_kg} კგ`:'—'},
                  {l:'მიზანი', v:GOAL_LABELS[profile?.goal||'loss']||'—'},
                  {l:'სამიზნე წონა', v:profile?.target_weight_kg?`${profile.target_weight_kg} კგ`:'—'},
                  {l:'ტემპი', v:AGGR_LABELS[profile?.aggressiveness||'moderate']||'—'},
                  {l:'შიმშილის პიკი', v:HUNGER_LABELS[profile?.hunger_peak||'even']||'—'},
                  {l:'კვების ადგილი', v:EATING_LABELS[profile?.eating_window||'standard']||'—'},
                ].map(({l,v}) => (
                  <div key={l} className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <div className="text-xs text-gray-400 mb-0.5">{l}</div>
                    <div className="text-sm font-semibold text-gray-800">{v}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div><label className="label">სქესი</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[['male','♂ მამრობითი'],['female','♀ მდედრობითი']].map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setEf({...ef,gender:v})}
                        className={clsx('py-2 rounded-xl text-sm font-medium border-2 transition',
                          ef.gender===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[{k:'age',l:'ასაკი',min:16,max:100},{k:'height_cm',l:'სიმაღლე (სმ)',min:100,max:250}].map(({k,l,min,max}) => (
                    <div key={k}><label className="label text-xs">{l}</label>
                      <input type="number" className="input text-sm" min={min} max={max} value={(ef as any)[k]} onChange={e => setEf({...ef,[k]:e.target.value})}/></div>
                  ))}
                </div>
                <div><label className="label">მიზანი</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[['loss','⬇️ კლება'],['maintain','➡️ შენარჩუნება'],['gain','⬆️ მომატება']].map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setEf({...ef,goal:v})}
                        className={clsx('py-2 rounded-xl text-sm font-medium border-2 transition',
                          ef.goal===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label text-xs">ამჟ. წონა (კგ)</label>
                    <input type="number" className="input text-sm" step="0.1" value={ef.weight_kg} onChange={e => setEf({...ef,weight_kg:e.target.value})}/></div>
                  {(ef.goal==='loss'||ef.goal==='gain') && (
                    <div><label className="label text-xs">სამიზნე წონა (კგ)</label>
                      <input type="number" className="input text-sm" step="0.5" value={ef.target_weight_kg} onChange={e => setEf({...ef,target_weight_kg:e.target.value})}/></div>
                  )}
                </div>
                <div><label className="label">ტემპი</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[['conservative','🐢 ნელი'],['moderate','⚖️ ზომიერი'],['aggressive','🔥 სწრაფი']].map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setEf({...ef,aggressiveness:v})}
                        className={clsx('py-2 rounded-xl text-sm font-medium border-2 transition',
                          ef.aggressiveness===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                    ))}
                  </div>
                </div>
                <div><label className="label">შიმშილის პიკი</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[['morning','🌅 დილით'],['noon','☀️ შუადღით'],['evening','🌙 საღამოს'],['even','⚖️ თანაბრად']].map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setEf({...ef,hunger_peak:v})}
                        className={clsx('py-2 rounded-xl text-sm font-medium border-2 transition',
                          ef.hunger_peak===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                    ))}
                  </div>
                </div>
                <div><label className="label">სად ჭამთ?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[['home','🏠 სახლი'],['standard','🏠+💼 სახლი+სამსახური'],['outside','🌍 გარეთ']].map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setEf({...ef,eating_window:v})}
                        className={clsx('py-2 rounded-xl text-xs font-medium border-2 transition text-center',
                          ef.eating_window===v?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600')}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {latestResult && (
            <div className="card shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><RefreshCw size={15} className="text-primary-600"/>ბოლო რეკომენდაცია</h2>
              <div className="grid grid-cols-3 gap-3">
                {[{l:'ცხიმის მოდ.',v:latestResult.fat_rec,c:'text-blue-700 bg-blue-50'},
                  {l:'კუნთის მოდ.',v:latestResult.mus_rec,c:'text-green-700 bg-green-50'},
                  {l:'ML რეგრ.',v:latestResult.reg_rec,c:'text-purple-700 bg-purple-50'}].map(({l,v,c}) => (
                  <div key={l} className={clsx('rounded-xl p-3 text-center',c)}>
                    <div className="text-xs opacity-70 mb-1">{l}</div>
                    <div className="text-xl font-bold">{v}</div>
                    <div className="text-xs opacity-60">კკ/დღე</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-3 text-xs text-gray-400">
                <span>Phase {latestResult.phase}</span><span>·</span>
                <span>TDEE: {latestResult.tdee_kcal} კკ</span><span>·</span>
                <span>{new Date(latestResult.calculated_at).toLocaleDateString('ka-GE')}</span>
              </div>
            </div>
          )}

          {weightData.length >= 2 && (
            <div className="card shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Scale size={15} className="text-primary-600"/>წონის დინამიკა</h2>
              <div className="relative h-40">
                <svg viewBox={`0 0 ${weightData.length*60} 120`} className="w-full h-full">
                  <defs>
                    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1"/><stop offset="100%" stopColor="#22d3ee"/>
                    </linearGradient>
                    <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  {[0,30,60,90,110].map(y => <line key={y} x1="0" y1={y} x2={weightData.length*60} y2={y} stroke="#f3f4f6" strokeWidth="1"/>)}
                  <polygon fill="url(#areaGrad)" points={[...weightData.map((_,i) => {
                    const x=i*60+30; const y=110-((weightData[i].w-minW)/wRange)*90; return `${x},${y}`;
                  }),`${(weightData.length-1)*60+30},110`,`30,110`].join(' ')}/>
                  <polyline fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    points={weightData.map((_,i) => { const x=i*60+30; const y=110-((weightData[i].w-minW)/wRange)*90; return `${x},${y}`; }).join(' ')}/>
                  {weightData.map((d,i) => { const x=i*60+30; const y=110-((d.w-minW)/wRange)*90; return (
                    <g key={i}>
                      <circle cx={x} cy={y} r="4" fill="#6366f1" stroke="white" strokeWidth="2"/>
                      <text x={x} y={y-8} textAnchor="middle" fontSize="9" fill="#6366f1" fontWeight="600">{d.w}</text>
                      <text x={x} y="118" textAnchor="middle" fontSize="8" fill="#9ca3af">{d.week}</text>
                    </g>
                  );})}
                </svg>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  {l:'საწყისი', v:`${weightData[0]?.w} კგ`, c:'text-gray-600'},
                  {l:'ამჟამინდელი', v:`${weightData[weightData.length-1]?.w} კგ`, c:'text-primary-600'},
                  {l:'სხვაობა', v:`${((weightData[weightData.length-1]?.w||0)-(weightData[0]?.w||0))>=0?'+':''}${((weightData[weightData.length-1]?.w||0)-(weightData[0]?.w||0)).toFixed(1)} კგ`,
                    c:(weightData[weightData.length-1]?.w||0)<(weightData[0]?.w||0)?'text-green-600':'text-red-500'},
                ].map(({l,v,c}) => (
                  <div key={l} className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <div className="text-xs text-gray-400">{l}</div>
                    <div className={clsx('text-sm font-bold mt-0.5',c)}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {checkins.length > 0 && (
            <div className="card shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Clock size={15} className="text-primary-600"/>Check-in ისტორია</h2>
              <div className="space-y-1.5">
                {checkins.slice(0,10).map((c:any) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl text-xs">
                    <span className="font-semibold text-gray-500 w-14 shrink-0">კვ. #{c.week}</span>
                    <span className="font-bold text-gray-900">{c.weight_kg} კგ</span>
                    <span className="text-gray-500">{c.calories} კკ</span>
                    <span className="text-gray-500">{c.sleep_h} სთ</span>
                    <span className="text-gray-400 ml-auto">{new Date(c.recorded_at).toLocaleDateString('ka-GE')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="text-center"><Link href="/personalization" className="btn-primary inline-block text-sm">პერსონალიზაციაზე →</Link></div>
    </div>
  );
}
