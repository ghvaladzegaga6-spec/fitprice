'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  Users, Building2, Plus, Trash2, PauseCircle, PlayCircle, Loader2,
  X, Eye, EyeOff, Pencil, Check, Shield, Key, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const isSuperAdmin = user?.role === 'super_admin';
  const isGymAdmin   = user?.role === 'gym_admin';

  const [tab, setTab] = useState<'users' | 'gyms' | 'password'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [gyms,  setGyms]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddGym,  setShowAddGym]  = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [showPasswordFor, setShowPasswordFor] = useState<string | null>(null);
  const [expandedGym, setExpandedGym] = useState<number | null>(null);
  const [gymAdminCreds, setGymAdminCreds] = useState<Record<number, any[]>>({});

  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', gym_id: '' });
  const [gymForm, setGymForm] = useState({
    name: '', address: '', logo_url: '', photo_url: '', description: '',
    admin_email: '', admin_password: '', admin_name: '',
  });
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', gym_id: '' });
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' });

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    if (!['super_admin', 'gym_admin'].includes(user.role)) { router.push('/basket'); return; }
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [u, g] = await Promise.all([api.get('/admin/users'), api.get('/admin/gyms')]);
      setUsers(u.data.users);
      setGyms(g.data.gyms);
    } catch { toast.error('მონაცემების ჩატვირთვა ვერ მოხდა'); }
    finally { setLoading(false); }
  };

  const handleAddUser = async () => {
    if (!userForm.email || !userForm.password || !userForm.name || !userForm.gym_id) {
      toast.error('ყველა ველი სავალდებულოა'); return;
    }
    try {
      await api.post('/admin/users/register', { ...userForm, gym_id: Number(userForm.gym_id) });
      toast.success('მომხმარებელი დარეგისტრირდა!');
      setUserForm({ email: '', password: '', name: '', gym_id: '' });
      setShowAddUser(false);
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleAddGym = async () => {
    if (!gymForm.name || !gymForm.admin_email || !gymForm.admin_password || !gymForm.admin_name) {
      toast.error('სახელი, ადმინი ველები სავალდებულოა'); return;
    }
    try {
      await api.post('/admin/gyms', gymForm);
      toast.success('დარბაზი დამატებულია ადმინ-ანგარიშთან ერთად!');
      setGymForm({ name: '', address: '', logo_url: '', photo_url: '', description: '', admin_email: '', admin_password: '', admin_name: '' });
      setShowAddGym(false);
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleEditUser = async (id: string) => {
    try {
      const payload: any = {};
      if (editForm.name)     payload.name = editForm.name;
      if (editForm.email)    payload.email = editForm.email;
      if (editForm.password) payload.password = editForm.password;
      if (editForm.gym_id && isSuperAdmin) payload.gym_id = Number(editForm.gym_id);
      await api.patch(`/admin/users/${id}`, payload);
      toast.success('მომხმარებელი განახლდა!');
      setEditingUser(null);
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleSuspend = async (id: string, suspended: boolean) => {
    try {
      await api.patch(`/admin/users/${id}/suspend`, { is_suspended: !suspended });
      toast.success(!suspended ? '⏸️ წვდომა დაპაუზდა' : '▶️ წვდომა განახლდა');
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('მომხმარებლის წაშლა? ეს შეუქცევადია.')) return;
    try {
      await api.delete(`/admin/users/${id}`);
      toast.success('წაიშალა');
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleDeleteGym = async (id: number) => {
    if (!confirm('დარბაზის წაშლა? ეს წაშლის ყველა დაკავშირებულ მომხმარებელს.')) return;
    try {
      await api.delete(`/admin/gyms/${id}`);
      toast.success('დარბაზი წაიშალა');
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleToggleGymActive = async (gym: any) => {
    try {
      await api.patch(`/admin/gyms/${gym.id}`, { is_active: !gym.is_active });
      toast.success(!gym.is_active ? '✅ დარბაზი გააქტიურდა' : '⏸️ დარბაზი დეაქტივირდა');
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const loadGymAdminCreds = async (gymId: number) => {
    if (gymAdminCreds[gymId]) return;
    try {
      const { data } = await api.get(`/admin/gyms/${gymId}/admin-credentials`);
      setGymAdminCreds(prev => ({ ...prev, [gymId]: data.admins }));
    } catch {}
  };

  const handleChangePassword = async () => {
    if (pwdForm.new_password !== pwdForm.confirm) {
      toast.error('ახალი პაროლები არ ემთხვევა'); return;
    }
    try {
      await api.patch('/admin/super/password', {
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      });
      toast.success('✅ პაროლი შეიცვალა');
      setPwdForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  if (!user) return null;

  const tabs = [
    { key: 'users', label: `მომხმარებლები (${users.length})`, icon: Users },
    { key: 'gyms',  label: `დარბაზები (${gyms.length})`,    icon: Building2 },
    ...(isSuperAdmin ? [{ key: 'password', label: 'პაროლი', icon: Lock }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield size={20} className={isSuperAdmin ? 'text-purple-600' : 'text-blue-500'} />
              <h1 className="text-2xl font-display font-bold text-gray-900">
                {isSuperAdmin ? 'სუპერ ადმინ პანელი' : 'დარბაზის ადმინ პანელი'}
              </h1>
            </div>
            <p className="text-sm text-gray-500">FITPRICE · {user.email}</p>
          </div>
          <div className="flex gap-2">
            {isSuperAdmin && (
              <button onClick={() => { setShowAddGym(true); setTab('gyms'); }}
                className="flex items-center gap-2 btn-secondary text-sm">
                <Building2 size={15} /> დარბაზის დამატება
              </button>
            )}
            <button onClick={() => { setShowAddUser(true); setTab('users'); }}
              className="flex items-center gap-2 btn-primary text-sm">
              <Plus size={15} /> მომხმარებლის დამატება
            </button>
          </div>
        </div>

        <div className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium',
          isSuperAdmin ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
        )}>
          <Shield size={13} />
          {isSuperAdmin ? 'სუპერ ადმინი — სრული წვდომა' : 'დარბაზის ადმინი — შეზღუდული წვდომა'}
        </div>

        <div className="flex border-b border-gray-200">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={clsx(
                'flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all',
                tab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
        ) : (
          <>
            {tab === 'users' && (
              <div className="space-y-4">
                {showAddUser && (
                  <div className="card border-2 border-primary-200 bg-primary-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">ახალი მომხმარებელი</h3>
                      <button onClick={() => setShowAddUser(false)}><X size={18} className="text-gray-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">სახელი</label>
                        <input className="input" placeholder="სრული სახელი" value={userForm.name}
                          onChange={e => setUserForm({...userForm, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">ელ-ფოსტა</label>
                        <input className="input" type="email" placeholder="user@example.com" value={userForm.email}
                          onChange={e => setUserForm({...userForm, email: e.target.value})} />
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
                          <option value="">აირჩიეთ დარბაზი</option>
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
                <div className="card p-0 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">მომხმარებელი</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">დარბაზი</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">სტატუსი</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">თარიღი</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">მოქმედება</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map(u => (
                        <>
                          <tr key={u.id} className={clsx('hover:bg-gray-50 transition', u.is_suspended && 'opacity-60')}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-sm text-gray-900">{u.name}</div>
                              <div className="text-xs text-gray-400">{u.email}</div>
                              {showPasswordFor === u.id && u.plain_password && (
                                <div className="text-xs text-blue-600 mt-0.5 font-mono bg-blue-50 px-1.5 py-0.5 rounded">
                                  პაროლი: {u.plain_password}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{u.gym_name || '—'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                {u.is_suspended
                                  ? <span className="tag bg-red-50 text-red-600">⏸️ დაპაუზებული</span>
                                  : <span className="tag bg-green-50 text-green-600">✅ აქტიური</span>
                                }
                                {u.role === 'gym_admin' && (
                                  <span className="tag bg-blue-50 text-blue-600">🏋️ დარბაზის ადმინი</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {new Date(u.created_at).toLocaleDateString('ka-GE')}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isSuperAdmin && (
                                  <button onClick={() => setShowPasswordFor(showPasswordFor === u.id ? null : u.id)}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                                    title="პაროლის ნახვა">
                                    <Eye size={14} />
                                  </button>
                                )}
                                <button
                                  onClick={() => { setEditingUser(editingUser === u.id ? null : u.id); setEditForm({ name: u.name, email: u.email, password: '', gym_id: u.gym_id || '' }); }}
                                  className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => handleSuspend(u.id, u.is_suspended)}
                                  className={clsx(
                                    'flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
                                    u.is_suspended ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                                  )}>
                                  {u.is_suspended
                                    ? <><PlayCircle size={12} /> გაგრძელება</>
                                    : <><PauseCircle size={12} /> პაუზა</>}
                                </button>
                                {isSuperAdmin && (
                                  <button onClick={() => handleDeleteUser(u.id)}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {editingUser === u.id && (
                            <tr key={`edit-${u.id}`} className="bg-blue-50/30">
                              <td colSpan={5} className="px-4 py-3">
                                <div className="grid grid-cols-4 gap-2">
                                  <div>
                                    <label className="label text-xs">სახელი</label>
                                    <input className="input text-sm py-1.5" value={editForm.name}
                                      onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                  </div>
                                  <div>
                                    <label className="label text-xs">ელ-ფოსტა</label>
                                    <input className="input text-sm py-1.5" value={editForm.email}
                                      onChange={e => setEditForm({...editForm, email: e.target.value})} />
                                  </div>
                                  <div>
                                    <label className="label text-xs">ახალი პაროლი</label>
                                    <input className="input text-sm py-1.5" type="text" placeholder="ცარიელი = არ შეიცვლება"
                                      value={editForm.password} onChange={e => setEditForm({...editForm, password: e.target.value})} />
                                  </div>
                                  {isSuperAdmin && (
                                    <div>
                                      <label className="label text-xs">დარბაზი</label>
                                      <select className="input text-sm py-1.5" value={editForm.gym_id}
                                        onChange={e => setEditForm({...editForm, gym_id: e.target.value})}>
                                        <option value="">დარბაზის გარეშე</option>
                                        {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                      </select>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2 mt-2">
                                  <button onClick={() => handleEditUser(u.id)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">
                                    <Check size={12} /> შენახვა
                                  </button>
                                  <button onClick={() => setEditingUser(null)}
                                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">გაუქმება</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                  {users.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm">მომხმარებლები არ არიან</div>
                  )}
                </div>
              </div>
            )}

            {tab === 'gyms' && (
              <div className="space-y-4">
                {showAddGym && isSuperAdmin && (
                  <div className="card border-2 border-primary-200 bg-primary-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">ახალი დარბაზი + ადმინ ანგარიში</h3>
                      <button onClick={() => setShowAddGym(false)}><X size={18} className="text-gray-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase">დარბაზის ინფო</div>
                      <div>
                        <label className="label">დარბაზის სახელი *</label>
                        <input className="input" placeholder="FitLife თბილისი" value={gymForm.name}
                          onChange={e => setGymForm({...gymForm, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">მისამართი</label>
                        <input className="input" placeholder="თბილისი, რუსთაველი 15" value={gymForm.address}
                          onChange={e => setGymForm({...gymForm, address: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">ლოგოს URL</label>
                        <input className="input" placeholder="https://..." value={gymForm.logo_url}
                          onChange={e => setGymForm({...gymForm, logo_url: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">ფოტოს URL</label>
                        <input className="input" placeholder="https://..." value={gymForm.photo_url}
                          onChange={e => setGymForm({...gymForm, photo_url: e.target.value})} />
                      </div>
                      <div className="col-span-2">
                        <label className="label">აღწერა</label>
                        <input className="input" placeholder="დარბაზის შესახებ..." value={gymForm.description}
                          onChange={e => setGymForm({...gymForm, description: e.target.value})} />
                      </div>
                      <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase mt-2">ადმინ ანგარიში</div>
                      <div>
                        <label className="label">ადმინის სახელი *</label>
                        <input className="input" placeholder="ადმინის სახელი" value={gymForm.admin_name}
                          onChange={e => setGymForm({...gymForm, admin_name: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">ადმინის ელ-ფოსტა *</label>
                        <input className="input" type="email" placeholder="admin@gym.com" value={gymForm.admin_email}
                          onChange={e => setGymForm({...gymForm, admin_email: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">ადმინის პაროლი *</label>
                        <input className="input" type="text" placeholder="მინ. 6 სიმბოლო" value={gymForm.admin_password}
                          onChange={e => setGymForm({...gymForm, admin_password: e.target.value})} />
                      </div>
                    </div>
                    <button onClick={handleAddGym} className="btn-primary mt-4 flex items-center gap-2">
                      <Plus size={15} /> დარბაზისა და ადმინის შექმნა
                    </button>
                  </div>
                )}
                <div className="space-y-3">
                  {gyms.map(g => (
                    <div key={g.id} className={clsx('card', !g.is_active && 'opacity-70')}>
                      <div className="flex items-start gap-4">
                        {g.photo_url ? (
                          <img src={g.photo_url} alt={g.name} className="w-20 h-20 object-cover rounded-xl shrink-0" />
                        ) : (
                          <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-accent-100 rounded-xl flex items-center justify-center shrink-0">
                            <Building2 size={28} className="text-primary-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900">{g.name}</h3>
                            <span className={clsx('tag text-xs', g.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500')}>
                              {g.is_active ? '✅ აქტიური' : '⏸️ დეაქტიური'}
                            </span>
                          </div>
                          {g.address && <p className="text-xs text-gray-500 mt-0.5">📍 {g.address}</p>}
                          {g.description && <p className="text-xs text-gray-400 mt-1">{g.description}</p>}
                          {isSuperAdmin && g.admin_email && (
                            <p className="text-xs text-blue-500 mt-1">ადმინი: {g.admin_email}</p>
                          )}
                        </div>
                        {isSuperAdmin && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => handleToggleGymActive(g)}
                              className={clsx(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                                g.is_active
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100'
                                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                              )}>
                              {g.is_active ? <><ToggleLeft size={13} /> დეაქტივაცია</> : <><ToggleRight size={13} /> გააქტიურება</>}
                            </button>
                            <button
                              onClick={() => {
                                const isOpen = expandedGym === g.id;
                                setExpandedGym(isOpen ? null : g.id);
                                if (!isOpen) loadGymAdminCreds(g.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-all">
                              <Key size={13} />
                              {expandedGym === g.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            <button onClick={() => handleDeleteGym(g.id)}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      {isSuperAdmin && expandedGym === g.id && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                          <div className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
                            <Key size={12} /> ადმინ ანგარიშები
                          </div>
                          {(gymAdminCreds[g.id] || []).length === 0 ? (
                            <div className="text-xs text-gray-400">ადმინი არ არის</div>
                          ) : (gymAdminCreds[g.id] || []).map((a: any) => (
                            <div key={a.id} className="flex items-center gap-4 bg-white rounded-lg px-3 py-2 text-xs mt-1">
                              <span className="font-medium text-gray-800">{a.name}</span>
                              <span className="text-gray-500">{a.email}</span>
                              <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">პაროლი: {a.plain_password}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {gyms.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm">დარბაზები არ არის</div>
                  )}
                </div>
              </div>
            )}

            {tab === 'password' && isSuperAdmin && (
              <div className="max-w-sm">
                <div className="card space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock size={18} className="text-purple-600" />
                    <h2 className="font-semibold text-gray-900">სუპერ ადმინის პაროლის შეცვლა</h2>
                  </div>
                  <div>
                    <label className="label">მიმდინარე პაროლი</label>
                    <input type="password" className="input" value={pwdForm.current_password}
                      onChange={e => setPwdForm({...pwdForm, current_password: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">ახალი პაროლი (მინ. 8)</label>
                    <input type="password" className="input" value={pwdForm.new_password}
                      onChange={e => setPwdForm({...pwdForm, new_password: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">გაიმეორე ახალი პაროლი</label>
                    <input type="password" className="input" value={pwdForm.confirm}
                      onChange={e => setPwdForm({...pwdForm, confirm: e.target.value})} />
                  </div>
                  <button onClick={handleChangePassword} className="btn-primary w-full flex items-center justify-center gap-2">
                    <Key size={15} /> პაროლის შეცვლა
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
