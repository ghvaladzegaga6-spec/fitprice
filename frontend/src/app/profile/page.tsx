'use client';
import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { useAuthStore } from '@/store/auth.store';
import { nutritionApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { User, Clock, TrendingDown, TrendingUp, Minus, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    nutritionApi.history()
      .then(({ data }) => setHistory(data.history))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  const goalIcon = (goal: string) => {
    if (goal === 'lose') return <TrendingDown size={13} className="text-blue-500" />;
    if (goal === 'gain') return <TrendingUp size={13} className="text-green-500" />;
    return <Minus size={13} className="text-gray-400" />;
  };

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* User info */}
        <div className="card flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-primary-400 to-accent-400 rounded-2xl flex items-center justify-center shadow">
            <span className="text-white font-bold text-2xl">{user.name?.[0]?.toUpperCase() || 'U'}</span>
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-sm text-gray-400">{user.email}</p>
            {user.role === 'admin' && (
              <Link href="/admin" className="inline-flex items-center gap-1 mt-1 text-xs text-primary-600 hover:underline">
                Admin Panel →
              </Link>
            )}
          </div>
        </div>

        {/* Nutrition History */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock size={16} className="text-primary-600" />
            კვების გათვლების ისტორია
          </h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary-400" /></div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <p>ჯერ გათვლები არ გაქვთ.</p>
              <Link href="/personalization" className="text-primary-600 hover:underline mt-1 block">პერსონალიზაციაზე გადასვლა →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-400 w-24 shrink-0">
                    {new Date(h.calculated_at).toLocaleDateString('ka-GE')}
                  </div>
                  <div className="flex items-center gap-3 flex-1 flex-wrap text-xs text-gray-600">
                    <span className="font-semibold text-gray-800">{h.adjusted_calories} კკალ</span>
                    <span>ც:{h.protein}გ</span>
                    <span>ცხ:{h.fat}გ</span>
                    <span>ნ:{h.carbs}გ</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span>BMI {h.bmi}</span>
                  </div>
                  {h.timeline && (
                    <div className="text-xs text-primary-600 shrink-0">{h.timeline}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-center">
          <Link href="/personalization" className="btn-primary inline-block text-sm">ახალი გათვლა</Link>
        </div>
      </main>
    </>
  );
}
