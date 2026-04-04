'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { 
  Users, Building2, Plus, Trash2, PauseCircle, PlayCircle, 
  Loader2, X, Eye, EyeOff, ChevronDown, ChevronUp 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [tab, setTab] = useState<'users' | 'gyms'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [gyms, setGyms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddGym, setShowAddGym] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', gym_id: '' });
  const [gymForm, setGymForm] = useState({ name: '', address: '', logo_url: '', photo_url: '', description: '' });

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    if (user.role !== 'admin') { router.push('/basket'); return; }
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [u, g] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/gyms'),
      ]);
      setUsers(u.data.users);
      setGyms(g.data.gyms);
    } catch {
      toast.error('შეცდომა მონაცემების ჩატვირთვაში');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!userForm.email || !userForm.password || !userForm.name || !userForm.gym_id) {
      toast.error('ყველა ველი სავალდებულოა'); return;
    }
    try {
      await api.post('/admin/users/register', { ...userForm, gym_id: Number(userForm.gym_id) });
      toast.success('მომხმარებელი დარეგისტრირდა ✅');
      setUserForm({ email: '', password: '', name: '', gym_id: '' });
      setShowAddUser(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    }
  };

  const handleAddGym = async () => {
    if (!gymForm.name) { toast.error('სახელი სავალდებულოა'); return; }
    try {
      await api.post('/admin/gyms', gymForm);
      toast.success('დარბაზი დაემატა ✅');
      setGymForm({ name: '', address: '', logo_url: '', photo_url: '', description: '' });
      setShowAddGym(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შეცდომა');
    }
  };

  const handleSuspend = async (id: string, suspended: boolean) => {
    try {
      await api.patch(`/admin/users/${id}/suspend`, { is_suspended: !suspended });
      toast.success(!suspended ? '⏸ პაუზა დაყენდა' : '▶️ წვდომა განახლდა');
      fetchAll();
    } catch {
      toast.error('შეცდომა');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('წავშალოთ მომხმარებელი?')) return;
    await api.delete(`/admin/users/${id}`);
    toast.success('წაიშალა');
    fetchAll();
  };

  const handleDeleteGym = async (id: number) => {
    if (!confirm('წავშალოთ დარბაზი?')) return;
    await api.delete(`/admin/gyms/${id}`);
    toast.success('დარბაზი წაიშალა');
    fetchAll();
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-500">FITPRICE მართვის პანელი</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowAddGym(true); setTab('gyms'); }}
              className="flex items-center gap-2 btn-secondary text-sm">
              <Building2 size={15} /> დარბაზის დამატება
            </button>
            <button onClick={() => { setShowAddUser(true); setTab('users'); }}
              className="flex items-center gap-2 btn-primary text-sm">
              <Plus size={15} /> მომხმარებლის დამატება
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { key: 'users', label: `მომხმარებლები (${users.length})`, icon: Users },
            { key: 'gyms', label: `დარბაზები (${gyms.length})`, icon: Building2 },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                tab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
        ) : (
          <>
            {/* მომხმარებლების ჩამონათვალი */}
            {tab === 'users' && (
              <div className="space-y-4">
                {/* Add User Form */}
                {showAddUser && (
                  <div className="card border-2 border-primary-200 bg-primary-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">ახალი მომხმარებელი</h3>
                      <button onClick={() => setShowAddUser(false)}><X size={18} className="text-gray-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">სახელი</label>
                        <input className="input" placeholder="გიორგი მაისურაძე"
                          value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">ელ-ფოსტა</label>
                        <input className="input" type="email" placeholder="user@example.com"
                          value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">პაროლი</label>
                        <div className="relative">
                          <input className="input pr-10" type={showPwd ? 'text' : 'password'} placeholder="მინ. 6 სიმბოლო"
                            value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
                          <button type="button" onClick={() => setShowPwd(!showPwd)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="label">დარბაზი</label>
                        <select className="input" value={userForm.gym_id}
                          onChange={e => setUserForm({...userForm, gym_id: e.target.value})}>
                          <option value="">აირჩიე დარბაზი</option>
                          {gyms.filter(g => g.is_active).map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button onClick={handleAddUser} className="btn-primary mt-4 flex items-center gap-2">
                      <Plus size={15} /> დარეგისტრირება
                    </button>
                  </div>
                )}

                {/* Users Table */}
                <div className="card p-0 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">მომხმარებელი</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">დარბაზი</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">სტატუსი</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">რეგისტრაცია</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-gray-500">მოქმედება</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map(u => (
                        <tr key={u.id} className={`hover:bg-gray-50 transition ${u.is_suspended ? 'opacity-60' : ''}`}>
                          <td className="px-5 py-3">
                            <div className="font-medium text-sm text-gray-900">{u.name}</div>
                            <div className="text-xs text-gray-400">{u.email}</div>
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-sm text-gray-600">{u.gym_name || '—'}</span>
                          </td>
                          <td className="px-5 py-3">
                            {u.is_suspended ? (
                              <span className="tag bg-red-50 text-red-600">⏸ პაუზა</span>
                            ) : (
                              <span className="tag bg-green-50 text-green-600">✅ აქტიური</span>
                            )}
                            {u.role === 'admin' && (
                              <span className="tag bg-purple-50 text-purple-600 ml-1">Admin</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-400">
                            {new Date(u.created_at).toLocaleDateString('ka-GE')}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {u.role !== 'admin' && (
                                <button onClick={() => handleSuspend(u.id, u.is_suspended)}
                                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    u.is_suspended 
                                      ? 'bg-green-50 text-green-600 hover:bg-green-100' 
                                      : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
                                  }`}>
                                  {u.is_suspended ? <><PlayCircle size={13} /> განახლება</> : <><PauseCircle size={13} /> პაუზა</>}
                                </button>
                              )}
                              {u.role !== 'admin' && (
                                <button onClick={() => handleDeleteUser(u.id)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {users.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm">მომხმარებლები არ არის</div>
                  )}
                </div>
              </div>
            )}

            {/* დარბაზების ჩამონათვალი */}
            {tab === 'gyms' && (
              <div className="space-y-4">
                {showAddGym && (
                  <div className="card border-2 border-primary-200 bg-primary-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">ახალი დარბაზი</h3>
                      <button onClick={() => setShowAddGym(false)}><X size={18} className="text-gray-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">სახელი *</label>
                        <input className="input" placeholder="FitLife Tbilisi"
                          value={gymForm.name} onChange={e => setGymForm({...gymForm, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">მისამართი</label>
                        <input className="input" placeholder="თბილისი, რუსთაველის 15"
                          value={gymForm.address} onChange={e => setGymForm({...gymForm, address: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">ლოგოს URL</label>
                        <input className="input" placeholder="https://..."
                          value={gymForm.logo_url} onChange={e => setGymForm({...gymForm, logo_url: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">ფოტოს URL</label>
                        <input className="input" placeholder="https://..."
                          value={gymForm.photo_url} onChange={e => setGymForm({...gymForm, photo_url: e.target.value})} />
                      </div>
                      <div className="col-span-2">
                        <label className="label">აღწერა</label>
                        <textarea className="input" rows={2} placeholder="დარბაზის შესახებ..."
                          value={gymForm.description} onChange={e => setGymForm({...gymForm, description: e.target.value})} />
                      </div>
                    </div>
                    <button onClick={handleAddGym} className="btn-primary mt-4 flex items-center gap-2">
                      <Plus size={15} /> დამატება
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {gyms.map(g => (
                    <div key={g.id} className={`card ${!g.is_active ? 'opacity-60' : ''}`}>
                      {g.photo_url ? (
                        <img src={g.photo_url} alt={g.name} className="w-full h-32 object-cover rounded-xl mb-3" />
                      ) : (
                        <div className="w-full h-32 bg-gradient-to-br from-primary-100 to-accent-100 rounded-xl mb-3 flex items-center justify-center">
                          <Building2 size={32} className="text-primary-300" />
                        </div>
                      )}
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{g.name}</h3>
                          {g.address && <p className="text-xs text-gray-500 mt-0.5">{g.address}</p>}
                          {g.description && <p className="text-xs text-gray-400 mt-1">{g.description}</p>}
                        </div>
                        <button onClick={() => handleDeleteGym(g.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-3">
                        <span className={`tag text-xs ${g.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                          {g.is_active ? '✅ აქტიური' : '⏸ გათიშული'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {gyms.length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-sm">დარბაზები არ არის დამატებული</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
