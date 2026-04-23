'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { User, Clock, RefreshCw, Loader2, TrendingDown, TrendingUp, Minus, Timer } from 'lucide-react';
import Link from 'next/link';
import { clsx } from 'clsx';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [checkins, setCheckins] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysUntilNext, setDaysUntilNext] = useState<number | null>(null);
  const [hoursUntilNext, setHoursUntilNext] = useState<number | null>(null);

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    api.get('/checkin/history').then(({ data }) => {
      setCheckins(data.checkins || []);
      setResults(data.results || []);

      // countdown
      if ((data.checkins || []).length > 0) {
        const last = new Date(data.checkins[0].recorded_at);
        const nextDate = new Date(last.getTime() + 7 * 24 * 60 * 60 * 1000);
        const diff = nextDate.getTime() - Date.now();
        if (diff > 0) {
          setDaysUntilNext(Math.floor(diff / (1000 * 60 * 60 * 24)));
          setHoursUntilNext(Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
        } else {
          setDaysUntilNext(0);
          setHoursUntilNext(0);
        }
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  const latestResult = results[0];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-in">

      {/* მომხმარებელი */}
      <div className="card flex items-center gap-4 shadow-sm">
        <div className="w-14 h-14 bg-gradient-to-br from-primary-400 to-accent-400 rounded-2xl flex items-center justify-center shadow">
          <span className="text-white font-bold text-2xl">{user.name?.[0]?.toUpperCase() || 'U'}</span>
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">{user.name}</h1>
          <p className="text-sm text-gray-400">{user.email}</p>
        </div>
      </div>

      {/* Check-in countdown */}
      {daysUntilNext !== null && (
        <div className={clsx('card shadow-sm border-2',
          daysUntilNext === 0 ? 'border-green-300 bg-green-50' : 'border-primary-100')}>
          <div className="flex items-center gap-3">
            <Timer size={20} className={daysUntilNext === 0 ? 'text-green-600' : 'text-primary-600'} />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">
                {daysUntilNext === 0 ? '✅ Check-in მზადაა!' : 'შემდეგი Check-in'}
              </h3>
              {daysUntilNext === 0 ? (
                <p className="text-xs text-green-600">ახლა შეგიძლიათ კვირეული check-in გაიაროთ</p>
              ) : (
                <p className="text-xs text-gray-500">
                  {daysUntilNext} დღე {hoursUntilNext} საათი
                </p>
              )}
            </div>
            {daysUntilNext === 0 && (
              <Link href="/personalization" className="ml-auto btn-primary text-sm py-1.5 px-3">
                Check-in →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ბოლო შედეგი */}
      {latestResult && (
        <div className="card shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <RefreshCw size={15} className="text-primary-600"/> ბოლო რეკომენდაცია
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:'ცხიმის მოდ.', val:latestResult.fat_rec, color:'text-blue-700 bg-blue-50' },
              { label:'კუნთის მოდ.', val:latestResult.mus_rec, color:'text-green-700 bg-green-50' },
              { label:'ML რეგრ.', val:latestResult.reg_rec, color:'text-purple-700 bg-purple-50' },
            ].map(({ label, val, color }) => (
              <div key={label} className={clsx('rounded-xl p-3 text-center', color)}>
                <div className="text-xs opacity-70 mb-1">{label}</div>
                <div className="text-xl font-bold">{val}</div>
                <div className="text-xs opacity-60">კკ/დღე</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
            <span>Phase {latestResult.phase}</span>
            <span>·</span>
            <span>TDEE: {latestResult.tdee_kcal} კკ</span>
            <span>·</span>
            <span>{new Date(latestResult.calculated_at).toLocaleDateString('ka-GE')}</span>
          </div>
        </div>
      )}

      {/* Check-in ისტორია */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary-400" /></div>
      ) : checkins.length > 0 ? (
        <div className="card shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock size={15} className="text-primary-600"/> Check-in ისტორია
          </h2>
          <div className="space-y-1.5">
            {checkins.slice(0, 10).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl text-xs">
                <span className="font-semibold text-gray-500 w-14 shrink-0">კვ. #{c.week}</span>
                <span className="font-bold text-gray-900">{c.weight_kg} კგ</span>
                <span className="text-gray-500">{c.calories} კკ</span>
                <span className="text-gray-500">{c.sleep_h} სთ ძ.</span>
                <span className="text-gray-400 ml-auto">
                  {new Date(c.recorded_at).toLocaleDateString('ka-GE')}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card text-center py-8 text-gray-400 text-sm">
          <p>Check-in ისტორია ცარიელია</p>
          <Link href="/personalization" className="text-primary-600 hover:underline mt-2 block">
            პირველი Check-in →
          </Link>
        </div>
      )}

      <div className="text-center">
        <Link href="/personalization" className="btn-primary inline-block text-sm">
          პერსონალიზაციაზე გადასვლა →
        </Link>
      </div>
    </div>
  );
}
