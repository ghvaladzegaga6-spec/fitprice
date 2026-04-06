'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  Users, Building2, Plus, Trash2, PauseCircle, PlayCircle, Loader2,
  X, Eye, EyeOff, Pencil, Check, Shield, Key, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Lock, Image, Upload, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const isSuperAdmin = user?.role === 'super_admin';
  const isGymAdmin   = user?.role === 'gym_admin';

  const [tab, setTab] = useState<'users' | 'gyms' | 'banners' | 'password'>('users');
  const [users, setUsers]   = useState<any[]>([]);
  const [gyms,  setGyms]    = useState<any[]>([]);
  const [ads,   setAds]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddGym,  setShowAddGym]  = useState(false);
  const [showPwd,     setShowPwd]     = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [showPasswordFor, setShowPasswordFor] = useState<string | null>(null);
  const [expandedGym, setExpandedGym] = useState<number | null>(null);
  const [gymAdminCreds, setGymAdminCreds] = useState<Record<number, any[]>>({});

  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', gym_id: '' });
  const [gymForm, setGymForm]   = useState({ name:'', address:'', logo_url:'', photo_url:'', description:'', admin_email:'', admin_password:'', admin_name:'' });
  const [editForm, setEditForm] = useState({ name:'', email:'', password:'', gym_id:'' });
  const [pwdForm,  setPwdForm]  = useState({ current_password:'', new_password:'', confirm:'' });

  // Banner state
  const [bannerForm, setBannerForm] = useState({ title:'', image_url:'', link_url:'' });
  const [bannerPreview, setBannerPreview] = useState<string>('');
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    if (!['super_admin', 'gym_admin'].includes(user.role)) { router.push('/basket'); return; }
    fetchAll();
    // Default tab: super_admin → users, gym_admin → users
    setTab('users');
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [api.get('/admin/users'), api.get('/admin/gyms')];
      if (user?.role === 'super_admin') promises.push(api.get('/ads/admin/all'));
      const results = await Promise.all(promises);
      setUsers(results[0].data.users);
      setGyms(results[1].data.gyms);
      if (results[2]) setAds(results[2].data.ads || []);
    } catch { toast.error('მონაცემების ჩატვირთვა ვერ მოხდა'); }
    finally { setLoading(false); }
  };

  // ─── User handlers ────────────────────────────────────────────────────────
  const handleAddUser = async () => {
    if (!userForm.email || !userForm.password || !userForm.name || !userForm.gym_id) {
      toast.error('ყველა ველი სავალდებულოა'); return;
    }
    try {
      await api.post('/admin/users/register', { ...userForm, gym_id: Number(userForm.gym_id) });
      toast.success('მომხმარებელი დარეგისტრირდა!');
      setUserForm({ email:'', password:'', name:'', gym_id:'' });
      setShowAddUser(false); fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleEditUser = async (id: string) => {
    try {
      const payload: any = {};
      if (editForm.name)    payload.name     = editForm.name;
      if (editForm.email)   payload.email    = editForm.email;
      if (editForm.password)payload.password = editForm.password;
      if (editForm.gym_id && isSuperAdmin) payload.gym_id = Number(editForm.gym_id);
      await api.patch(`/admin/users/${id}`, payload);
      toast.success('განახლდა!'); setEditingUser(null); fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleSuspend = async (id: string, suspended: boolean) => {
    try {
      await api.patch(`/admin/users/${id}/suspend`, { is_suspended: !suspended });
      toast.success(!suspended ? '⏸️ დაპაუზდა' : '▶️ განახლდა'); fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('მომხმარებლის წაშლა?')) return;
    try { await api.delete(`/admin/users/${id}`); toast.success('წაიშალა'); fetchAll(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  // ─── Gym handlers ────────────────────────────────────────────────────────
  const handleAddGym = async () => {
    if (!gymForm.name || !gymForm.admin_email || !gymForm.admin_password || !gymForm.admin_name) {
      toast.error('სავალდებულო ველები შეავსე'); return;
    }
    try {
      await api.post('/admin/gyms', gymForm);
      toast.success('დარბაზი დაემატა!');
      setGymForm({ name:'', address:'', logo_url:'', photo_url:'', description:'', admin_email:'', admin_password:'', admin_name:'' });
      setShowAddGym(false); fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const handleDeleteGym = async (id: number) => {
    if (!confirm('დარბაზის წაშლა? ყველა მომხმარებელი გათიშული დარჩება.')) return;
    try {
      await api.delete(`/admin/gyms/${id}`);
      toast.success('დარბაზი წაიშალა'); fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'სერვერის შეცდომა — სცადეთ კვლავ'); }
  };

  const handleToggleGym = async (gym: any) => {
    try {
      await api.patch(`/admin/gyms/${gym.id}`, { is_active: !gym.is_active });
      toast.success(!gym.is_active ? '✅ გააქტიურდა' : '⏸️ დეაქტივირდა'); fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  const loadGymAdminCreds = async (gymId: number) => {
    if (gymAdminCreds[gymId]) return;
    try {
      const { data } = await api.get(`/admin/gyms/${gymId}/admin-credentials`);
      setGymAdminCreds(prev => ({ ...prev, [gymId]: data.admins }));
    } catch {}
  };

  // ─── Banner handlers ──────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setBannerPreview(dataUrl);
      setBannerForm(prev => ({ ...prev, image_url: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddBanner = async () => {
    if (!bannerForm.image_url) { toast.error('ბანერის სურათი სავალდებულოა'); return; }
    setUploadingBanner(true);
    try {
      await api.post('/ads', bannerForm);
      toast.success('ბანერი დაემატა! ✅');
      setBannerForm({ title:'', image_url:'', link_url:'' });
      setBannerPreview('');
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
    finally { setUploadingBanner(false); }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('ბანერის წაშლა?')) return;
    try { await api.delete(`/ads/${id}`); toast.success('ბანერი წაიშალა'); fetchAll(); }
    catch { toast.error('შეცდომა'); }
  };

  const handleToggleBanner = async (ad: any) => {
    try {
      await api.patch(`/ads/${ad.id}`, { is_active: !ad.is_active });
      toast.success(!ad.is_active ? '✅ გააქტიურდა' : '⏸️ დაიმალა'); fetchAll();
    } catch { toast.error('შეცდომა'); }
  };

  // ─── Password ─────────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (pwdForm.new_password !== pwdForm.confirm) { toast.error('პაროლები არ ემთხვევა'); return; }
    try {
      await api.patch('/admin/super/password', { current_password: pwdForm.current_password, new_password: pwdForm.new_password });
      toast.success('✅ პაროლი შეიცვალა');
      setPwdForm({ current_password:'', new_password:'', confirm:'' });
    } catch (err: any) { toast.error(err.response?.data?.error || 'შეცდომა'); }
  };

  if (!user) return null;

  const tabs = [
    { key:'users',   label:`მომხმარებლები (${users.length})`, icon: Users },
    { key:'gyms',    label:`დარბაზები (${gyms.length})`,      icon: Building2 },
    ...(isSuperAdmin ? [
      { key:'banners', label:`ბანერები (${ads.length})`, icon: Image },
      { key:'password',label:'პაროლი',                   icon: Lock  },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
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

        {/* Tabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={clsx(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap',
                tab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
        ) : (
          <>
            {/* ── USERS ── */}
            {tab === 'users' && (
              <div className="space-y-4">
                {showAddUser && (
                  <div className="card border-2 border-primary-200 bg-primary-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">ახალი მომხმარებელი</h3>
                      <button onClick={() => setShowAddUser(false)}><X size={18} className="text-gray-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="label">სახელი</label>
                        <input className="input" placeholder="სახელი გვარი" value={userForm.name}
                          onChange={e => setUserForm({...userForm, name: e.target.value})} /></div>
                      <div><label className="label">ელ-ფოსტა</label>
                        <input className="input" type="email" value={userForm.email}
                          onChange={e => setUserForm({...userForm, email: e.target.value})} /></div>
                      <div><label className="label">პაროლი</label>
                        <div className="relative">
                          <input className="input pr-10" type={showPwd ? 'text' : 'password'} placeholder="მინ. 6"
                            value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
                          <button type="button" onClick={() => setShowPwd(!showPwd)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                          </button>
                        </div></div>
                      <div><label className="label">დარბაზი</label>
                        <select className="input" value={userForm.gym_id}
                          onChange={e => setUserForm({...userForm, gym_id: e.target.value})}>
                          <option value="">აირჩიეთ</option>
                          {gyms.filter(g => g.is_active).map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select></div>
                    </div>
                    <button onClick={handleAddUser} className="btn-primary mt-4 flex items-center gap-2">
                      <Plus size={15}/> დარეგისტრირება
                    </button>
                  </div>
                )}
                <div className="card p-0 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['მომხმარებელი','დარბაზი','სტატუსი','თარიღი','მოქმედება'].map(h => (
                          <th key={h} className={clsx('px-4 py-3 text-xs font-medium text-gray-500', h === 'მოქმედება' ? 'text-right' : 'text-left')}>{h}</th>
                        ))}
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
                            <td className="px-4 py-3 text-sm text-gray-600">{u.gym_name || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                {u.is_suspended
                                  ? <span className="tag bg-red-50 text-red-600">⏸️ დაპაუზებული</span>
                                  : <span className="tag bg-green-50 text-green-600">✅ აქტიური</span>}
                                {u.role === 'gym_admin' && <span className="tag bg-blue-50 text-blue-600">🏋️ ადმინი</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {new Date(u.created_at).toLocaleDateString('ka-GE')}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isSuperAdmin && (
                                  <button onClick={() => setShowPasswordFor(showPasswordFor === u.id ? null : u.id)}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                                    <Eye size={14}/>
                                  </button>
                                )}
                                <button onClick={() => { setEditingUser(editingUser === u.id ? null : u.id); setEditForm({ name: u.name, email: u.email, password:'', gym_id: u.gym_id || '' }); }}
                                  className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                                  <Pencil size={14}/>
                                </button>
                                <button onClick={() => handleSuspend(u.id, u.is_suspended)}
                                  className={clsx('flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
                                    u.is_suspended ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600')}>
                                  {u.is_suspended ? <><PlayCircle size={12}/> გაგრძელება</> : <><PauseCircle size={12}/> პაუზა</>}
                                </button>
                                {isSuperAdmin && (
                                  <button onClick={() => handleDeleteUser(u.id)}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                                    <Trash2 size={14}/>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {editingUser === u.id && (
                            <tr key={`edit-${u.id}`} className="bg-blue-50/30">
                              <td colSpan={5} className="px-4 py-3">
                                <div className="grid grid-cols-4 gap-2">
                                  <div><label className="label text-xs">სახელი</label>
                                    <input className="input text-sm py-1.5" value={editForm.name}
                                      onChange={e => setEditForm({...editForm, name: e.target.value})} /></div>
                                  <div><label className="label text-xs">ელ-ფოსტა</label>
                                    <input className="input text-sm py-1.5" value={editForm.email}
                                      onChange={e => setEditForm({...editForm, email: e.target.value})} /></div>
                                  <div><label className="label text-xs">ახალი პაროლი</label>
                                    <input className="input text-sm py-1.5" type="text" placeholder="ცარიელი = არ შეიცვლება"
                                      value={editForm.password} onChange={e => setEditForm({...editForm, password: e.target.value})} /></div>
                                  {isSuperAdmin && (
                                    <div><label className="label text-xs">დარბაზი</label>
                                      <select className="input text-sm py-1.5" value={editForm.gym_id}
                                        onChange={e => setEditForm({...editForm, gym_id: e.target.value})}>
                                        <option value="">დარბაზის გარეშე</option>
                                        {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                      </select></div>
                                  )}
                                </div>
                                <div className="flex gap-2 mt-2">
                                  <button onClick={() => handleEditUser(u.id)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">
                                    <Check size={12}/> შენახვა
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
                  {users.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">მომხმარებლები არ არიან</div>}
                </div>
              </div>
            )}

            {/* ── GYMS ── */}
            {tab === 'gyms' && (
              <div className="space-y-4">
                {showAddGym && isSuperAdmin && (
                  <div className="card border-2 border-primary-200 bg-primary-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">ახალი დარბაზი + ადმინ ანგარიში</h3>
                      <button onClick={() => setShowAddGym(false)}><X size={18} className="text-gray-400"/></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase">დარბაზის ინფო</div>
                      {[
                        { key:'name',        label:'სახელი *',     placeholder:'FitLife თბილისი' },
                        { key:'address',     label:'მისამართი',    placeholder:'რუსთაველი 15' },
                        { key:'logo_url',    label:'ლოგო URL',     placeholder:'https://...' },
                        { key:'photo_url',   label:'ფოტო URL',     placeholder:'https://...' },
                      ].map(({ key, label, placeholder }) => (
                        <div key={key}>
                          <label className="label">{label}</label>
                          <input className="input" placeholder={placeholder} value={(gymForm as any)[key]}
                            onChange={e => setGymForm({...gymForm, [key]: e.target.value})} />
                        </div>
                      ))}
                      <div className="col-span-2">
                        <label className="label">აღწერა</label>
                        <input className="input" value={gymForm.description}
                          onChange={e => setGymForm({...gymForm, description: e.target.value})} />
                      </div>
                      <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase mt-2">ადმინ ანგარიში</div>
                      {[
                        { key:'admin_name',     label:'ადმინის სახელი *',   placeholder:'ადმინი' },
                        { key:'admin_email',    label:'ადმინის ელ-ფოსტა *', placeholder:'admin@gym.com', type:'email' },
                        { key:'admin_password', label:'ადმინის პაროლი *',   placeholder:'მინ. 6 სიმბ.' },
                      ].map(({ key, label, placeholder, type }) => (
                        <div key={key}>
                          <label className="label">{label}</label>
                          <input className="input" type={type || 'text'} placeholder={placeholder}
                            value={(gymForm as any)[key]} onChange={e => setGymForm({...gymForm, [key]: e.target.value})} />
                        </div>
                      ))}
                    </div>
                    <button onClick={handleAddGym} className="btn-primary mt-4 flex items-center gap-2">
                      <Plus size={15}/> დარბაზისა და ადმინის შექმნა
                    </button>
                  </div>
                )}
                <div className="space-y-3">
                  {gyms.map(g => (
                    <div key={g.id} className={clsx('card', !g.is_active && 'opacity-70')}>
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-primary-100 to-accent-100 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                          {g.photo_url
                            ? <img src={g.photo_url} alt={g.name} className="w-full h-full object-cover" />
                            : <Building2 size={24} className="text-primary-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900">{g.name}</h3>
                            <span className={clsx('tag text-xs', g.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500')}>
                              {g.is_active ? '✅ აქტიური' : '⏸️ დეაქტიური'}
                            </span>
                          </div>
                          {g.address && <p className="text-xs text-gray-500 mt-0.5">📍 {g.address}</p>}
                          {isSuperAdmin && g.admin_email && <p className="text-xs text-blue-400 mt-0.5">ადმინი: {g.admin_email}</p>}
                        </div>
                        {isSuperAdmin && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => handleToggleGym(g)}
                              className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all',
                                g.is_active ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200')}>
                              {g.is_active ? <><ToggleLeft size={12}/> გათიშვა</> : <><ToggleRight size={12}/> გააქტიურება</>}
                            </button>
                            <button onClick={() => { const isOpen = expandedGym===g.id; setExpandedGym(isOpen?null:g.id); if(!isOpen) loadGymAdminCreds(g.id); }}
                              className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                              <Key size={14}/>
                            </button>
                            <button onClick={() => handleDeleteGym(g.id)}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        )}
                      </div>
                      {isSuperAdmin && expandedGym === g.id && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                          <div className="text-xs font-semibold text-blue-700 mb-2">🔑 ადმინ ანგარიშები</div>
                          {(gymAdminCreds[g.id] || []).length === 0
                            ? <div className="text-xs text-gray-400">ადმინი არ არის</div>
                            : (gymAdminCreds[g.id] || []).map((a: any) => (
                              <div key={a.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-xs mt-1">
                                <span className="font-medium text-gray-800">{a.name}</span>
                                <span className="text-gray-500">{a.email}</span>
                                <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">პაროლი: {a.plain_password}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {gyms.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">დარბაზები არ არის</div>}
                </div>
              </div>
            )}

            {/* ── BANNERS ── */}
            {tab === 'banners' && isSuperAdmin && (
              <div className="space-y-4">
                <div className="card border-2 border-primary-200 bg-primary-50/30">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Upload size={16} className="text-primary-600"/> ახალი ბანერი
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="label">სათაური (სურვილისამებრ)</label>
                      <input className="input" placeholder="ბანერის სათაური" value={bannerForm.title}
                        onChange={e => setBannerForm({...bannerForm, title: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">სურათი *</label>
                      <div className="flex gap-2">
                        <input className="input flex-1" placeholder="https://... ან ატვირთე ფაილი"
                          value={bannerForm.image_url.startsWith('data:') ? '📎 ფაილი ატვირთულია' : bannerForm.image_url}
                          onChange={e => { setBannerForm({...bannerForm, image_url: e.target.value}); setBannerPreview(e.target.value); }}
                          readOnly={bannerForm.image_url.startsWith('data:')} />
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          className="btn-secondary flex items-center gap-1.5 text-sm whitespace-nowrap">
                          <Upload size={14}/> ატვირთვა
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                      </div>
                    </div>
                    <div>
                      <label className="label">ბმული (სურვილისამებრ)</label>
                      <input className="input" placeholder="https://..." value={bannerForm.link_url}
                        onChange={e => setBannerForm({...bannerForm, link_url: e.target.value})} />
                    </div>
                    {bannerPreview && (
                      <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                        <div className="text-xs text-gray-400 px-3 py-1.5 border-b">გადახედვა:</div>
                        <img src={bannerPreview} alt="preview" className="w-full h-20 object-cover" />
                      </div>
                    )}
                    <button onClick={handleAddBanner} disabled={uploadingBanner}
                      className="btn-primary flex items-center gap-2">
                      {uploadingBanner ? <Loader2 size={15} className="animate-spin"/> : <Plus size={15}/>}
                      ბანერის დამატება
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {ads.map((ad: any) => (
                    <div key={ad.id} className={clsx('card flex items-center gap-4', !ad.is_active && 'opacity-60')}>
                      <div className="w-24 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                        <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">{ad.title || 'სახელი არ არის'}</div>
                        {ad.link_url && (
                          <a href={ad.link_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                            <ExternalLink size={10}/> {ad.link_url.slice(0,40)}...
                          </a>
                        )}
                        <span className={clsx('tag text-xs mt-1', ad.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500')}>
                          {ad.is_active ? '✅ ჩართული' : '⏸️ გამორთული'}
                        </span>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => handleToggleBanner(ad)}
                          className={clsx('p-1.5 rounded-lg transition', ad.is_active ? 'text-yellow-500 hover:bg-yellow-50' : 'text-green-500 hover:bg-green-50')}>
                          {ad.is_active ? <ToggleLeft size={16}/> : <ToggleRight size={16}/>}
                        </button>
                        <button onClick={() => handleDeleteBanner(ad.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                          <Trash2 size={15}/>
                        </button>
                      </div>
                    </div>
                  ))}
                  {ads.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">ბანერები არ არის</div>}
                </div>
              </div>
            )}

            {/* ── PASSWORD ── */}
            {tab === 'password' && isSuperAdmin && (
              <div className="max-w-sm">
                <div className="card space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock size={18} className="text-purple-600"/>
                    <h2 className="font-semibold text-gray-900">სუპერ ადმინის პაროლის შეცვლა</h2>
                  </div>
                  {[
                    { key:'current_password', label:'მიმდინარე პაროლი' },
                    { key:'new_password',     label:'ახალი პაროლი (მინ. 8)' },
                    { key:'confirm',          label:'გაიმეორე ახალი პაროლი' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="label">{label}</label>
                      <input type="password" className="input" value={(pwdForm as any)[key]}
                        onChange={e => setPwdForm({...pwdForm, [key]: e.target.value})} />
                    </div>
                  ))}
                  <button onClick={handleChangePassword} className="btn-primary w-full flex items-center justify-center gap-2">
                    <Key size={15}/> პაროლის შეცვლა
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
