'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { Building2, Lock, LogIn } from 'lucide-react';
import Link from 'next/link';

interface Gym {
  id: number;
  name: string;
  address: string;
  logo_url: string;
  photo_url: string;
  description: string;
}

export function GymCheck({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSuspended, setUserSuspended] = useState(false);

  useEffect(() => {
    // Public gym list
    api.get('/admin/gyms/public').then(({ data }) => setGyms(data.gyms)).catch(() => {});
    
    // Check if user is suspended
    if (user) {
      api.get('/auth/me').then(({ data }) => {
        setUserSuspended(data.user?.is_suspended || false);
      }).catch(() => {}).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) return null;

  // შეჩერებული მომხმარებელი
  if (user && userSuspended) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
          <Lock size={32} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">წვდომა შეჩერებულია</h2>
        <p className="text-gray-500 text-sm max-w-sm">
          თქვენი სერვისი დროებით შეჩერებულია. გთხოვთ განაახლოთ დარბაზის აბონიმენტი და დაუკავშირდეთ ადმინისტრატორს.
        </p>
      </div>
    );
  }

  // შეუსვლელი მომხმარებელი
  if (!user) {
    return (
      <div className="space-y-8 py-8 px-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock size={32} className="text-primary-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">პერსონალიზაციის სერვისი</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            ეს სერვისი ხელმისაწვდომია მხოლოდ <strong>FITPRICE-თან დაკავშირებული ფიტნეს დარბაზების</strong> წევრებისთვის.
            შედი შენს აქაუნთში ან დაუკავშირდი შენს დარბაზს.
          </p>
          <Link href="/auth/login" className="btn-primary inline-flex items-center gap-2 mt-6">
            <LogIn size={16} /> შესვლა
          </Link>
        </div>

        {/* დარბაზების სია */}
        {gyms.length > 0 && (
          <div>
            <h3 className="text-center font-semibold text-gray-700 mb-4">ჩვენი პარტნიორი დარბაზები</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {gyms.map(gym => (
                <div key={gym.id} className="card hover:shadow-md transition-shadow">
                  {gym.photo_url ? (
                    <img src={gym.photo_url} alt={gym.name} className="w-full h-40 object-cover rounded-xl mb-3" />
                  ) : (
                    <div className="w-full h-40 bg-gradient-to-br from-primary-100 to-accent-100 rounded-xl mb-3 flex items-center justify-center">
                      {gym.logo_url ? (
                        <img src={gym.logo_url} alt={gym.name} className="h-16 object-contain" />
                      ) : (
                        <Building2 size={40} className="text-primary-300" />
                      )}
                    </div>
                  )}
                  <h4 className="font-semibold text-gray-900">{gym.name}</h4>
                  {gym.address && (
                    <p className="text-xs text-gray-500 mt-1">📍 {gym.address}</p>
                  )}
                  {gym.description && (
                    <p className="text-xs text-gray-400 mt-2">{gym.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // შესული მომხმარებელი — ჩვეულებრივ კონტენტს ვაჩვენებთ
  return <>{children}</>;
}
