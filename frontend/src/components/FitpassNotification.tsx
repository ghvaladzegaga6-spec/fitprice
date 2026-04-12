'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { AlertTriangle, X } from 'lucide-react';

export function FitpassNotification() {
  const { user } = useAuthStore();
  const [info, setInfo] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get('/fitpass/my-status').then(({ data }) => {
      if (data.member && data.member.days_remaining <= 5 && data.member.days_remaining > 0) {
        setInfo(data.member);
      }
    }).catch(() => {});
  }, [user]);

  if (!info || dismissed) return null;

  const days = Math.ceil(Number(info.days_remaining));

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
      <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-orange-900 text-sm">Fitpass სერვისი იწურება!</h3>
            <p className="text-xs text-orange-700 mt-1">
              თქვენი Fitpass სერვისი <strong>{days} დღეში</strong> ამოიწურება.
              სერვისის გასაგრძელებლად გადადით თქვენს დარბაზში.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-2 bg-orange-200 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all"
                  style={{ width: `${(days / 30) * 100}%` }} />
              </div>
              <span className="text-xs font-bold text-orange-700">{days}/30</span>
            </div>
          </div>
          <button onClick={() => setDismissed(true)}
            className="p-1 text-orange-400 hover:text-orange-600 transition">
            <X size={16}/>
          </button>
        </div>
      </div>
    </div>
  );
}
