'use client';
import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { Trash2, Plus, Loader2, Image as ImgIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', image_url: '', link_url: '', display_order: 0 });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin') { router.push('/basket'); return; }
    if (!user) { router.push('/auth/login'); return; }
    fetchAds();
  }, [user]);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ads');
      setAds(data.ads);
    } finally { setLoading(false); }
  };

  const addAd = async () => {
    if (!form.image_url) { toast.error('სურათის URL სავალდებულოა'); return; }
    setAdding(true);
    try {
      await api.post('/ads', form);
      toast.success('რეკლამა დამატებულია');
      setForm({ title: '', image_url: '', link_url: '', display_order: 0 });
      fetchAds();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'შეცდომა');
    } finally { setAdding(false); }
  };

  const deleteAd = async (id: string) => {
    if (!confirm('წაიშალოს?')) return;
    await api.delete(`/ads/${id}`);
    toast.success('წაიშალა');
    fetchAds();
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Admin — რეკლამების მართვა</h1>
          <p className="text-sm text-gray-500 mt-1">მაქსიმუმ 5 ბანერი · ყოველ 10 წამში ენაცვლება</p>
        </div>

        {/* Add Ad */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Plus size={16} /> ახალი რეკლამა</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">სათაური (სურვილისამებრ)</label>
              <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="მაგ: სამარხვო კვება" />
            </div>
            <div>
              <label className="label">სურათის URL *</label>
              <input className="input" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className="label">ბმული (კლიკზე)</label>
              <input className="input" value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className="label">რიგი (0-4)</label>
              <input type="number" className="input" min={0} max={4} value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })} />
            </div>
          </div>
          <button onClick={addAd} disabled={adding} className="btn-primary flex items-center gap-2">
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            დამატება
          </button>
        </div>

        {/* Existing Ads */}
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">არსებული რეკლამები ({ads.length})</h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary-400" /></div>
          ) : ads.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm flex flex-col items-center gap-2">
              <ImgIcon size={24} className="text-gray-200" />
              <p>რეკლამები არ არის</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ads.map(ad => (
                <div key={ad.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition group">
                  <img src={ad.image_url} alt={ad.title} className="w-20 h-12 object-cover rounded-lg bg-gray-100" onError={e => { (e.target as any).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="48"><rect fill="%23f1f5f9" width="80" height="48"/></svg>'; }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 truncate">{ad.title || '(სათაური არ არის)'}</p>
                    <p className="text-xs text-gray-400 truncate">{ad.link_url || 'ბმული არ არის'}</p>
                    <p className="text-xs text-gray-300">რიგი: {ad.display_order}</p>
                  </div>
                  <button onClick={() => deleteAd(ad.id)} className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
