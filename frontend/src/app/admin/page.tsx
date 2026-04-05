'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Users, Building2, Plus, Trash2, PauseCircle, PlayCircle, Loader2, X, Eye, EyeOff, Pencil, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const isSuperAdmin = user?.role === 'super_admin';
  const isGymAdmin = user?.role === 'gym_admin';

  const [tab, setTab] = useState<'users' | 'gyms'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [gyms, setGyms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddGym, setShowAddGym] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [showPasswordFor, setShowPasswordFor] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', gym_id: '' });
  const [gymForm, setGymForm] = useState({ name: '', address: '', logo_url: '', photo_url: '', description: '', admin_email: '', admin_password: '', admin_name: '' });
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', gym_id: '' });

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    if (!['super_admin', 'gym_admin'].includes(user.role)) { router.push('/basket'); return; }
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const promises = [api.get('/admin/users')];
      if (isSuperAdmin) promises.push(api.get('/admin/gyms'));
      else promises.push(api.get('/admin/gyms'));
      const [u, g] = await Promise.all(promises);
      setUsers(u.data.users);
      setGyms(g.data.gyms);
    } catch { toast.error('Error loading data'); }
    finally { setLoading(false); }
  };

  const handleAddUser = async () => {
    if (!userForm.email || !userForm.password || !userForm.name || !userForm.gym_id) {
      toast.error('All fields required'); return;
    }
    try {
      await api.post('/admin/users/register', { ...userForm, gym_id: Number(userForm.gym_id) });
      toast.success('User registered!');
      setUserForm({ email: '', password: '', name: '', gym_id: '' });
      setShowAddUser(false);
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleAddGym = async () => {
    if (!gymForm.name || !gymForm.admin_email || !gymForm.admin_password || !gymForm.admin_name) {
      toast.error('Gym name, admin email, password and name required'); return;
    }
    try {
      await api.post('/admin/gyms', gymForm);
      toast.success('Gym added with admin account!');
      setGymForm({ name: '', address: '', logo_url: '', photo_url: '', description: '', admin_email: '', admin_password: '', admin_name: '' });
      setShowAddGym(false);
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleEditUser = async (id: string) => {
    try {
      const payload: any = {};
      if (editForm.name) payload.name = editForm.name;
      if (editForm.email) payload.email = editForm.email;
      if (editForm.password) payload.password = editForm.password;
      if (editForm.gym_id) payload.gym_id = Number(editForm.gym_id);
      await api.patch(`/admin/users/${id}`, payload);
      toast.success('User updated!');
      setEditingUser(null);
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleSuspend = async (id: string, suspended: boolean) => {
    try {
      await api.patch(`/admin/users/${id}/suspend`, { is_suspended: !suspended });
      toast.success(!suspended ? 'User suspended' : 'Access restored');
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Delete user?')) return;
    await api.delete(`/admin/users/${id}`);
    toast.success('Deleted');
    fetchAll();
  };

  const handleDeleteGym = async (id: number) => {
    if (!confirm('Delete gym?')) return;
    await api.delete(`/admin/gyms/${id}`);
    toast.success('Gym deleted');
    fetchAll();
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">
              {isSuperAdmin ? 'Super Admin Panel' : 'Gym Admin Panel'}
            </h1>
            <p className="text-sm text-gray-500">FITPRICE · {user.email}</p>
          </div>
          <div className="flex gap-2">
            {isSuperAdmin && (
              <button onClick={() => { setShowAddGym(true); setTab('gyms'); }}
                className="flex items-center gap-2 btn-secondary text-sm">
                <Building2 size={15} /> Add Gym
              </button>
            )}
            <button onClick={() => { setShowAddUser(true); setTab('users'); }}
              className="flex items-center gap-2 btn-primary text-sm">
              <Plus size={15} /> Add User
            </button>
          </div>
        </div>

        <div className="flex border-b border-gray-200">
          {[
            { key: 'users', label: `Users (${users.length})`, icon: Users },
            { key: 'gyms', label: `Gyms (${gyms.length})`, icon: Building2 },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all ${tab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`}>
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
                      <h3 className="font-semibold text-gray-900">New User</h3>
                      <button onClick={() => setShowAddUser(false)}><X size={18} className="text-gray-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Name</label>
                        <input className="input" placeholder="Full name" value={userForm.name}
                          onChange={e => setUserForm({...userForm, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">Email</label>
                        <input className="input" type="email" placeholder="user@example.com" value={userForm.email}
                          onChange={e => setUserForm({...userForm, email: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">Password</label>
                        <div className="relative">
                          <input className="input pr-10" type={showPwd ? 'text' : 'password'} placeholder="Min 6 chars"
                            value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
                          <button type="button" onClick={() => setShowPwd(!showPwd)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="label">Gym</label>
                        <select className="input" value={userForm.gym_id}
                          onChange={e => setUserForm({...userForm, gym_id: e.target.value})}>
                          <option value="">Select gym</option>
                          {gyms.filter(g => g.is_active).map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button onClick={handleAddUser} className="btn-primary mt-4 flex items-center gap-2">
                      <Plus size={15} /> Register User
                    </button>
                  </div>
                )}

                <div className="card p-0 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">User</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Gym</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Registered</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map(u => (
                        <>
                          <tr key={u.id} className={`hover:bg-gray-50 transition ${u.is_suspended ? 'opacity-60' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-sm text-gray-900">{u.name}</div>
                              <div className="text-xs text-gray-400">{u.email}</div>
                              {showPasswordFor === u.id && u.plain_password && (
                                <div className="text-xs text-blue-600 mt-0.5 font-mono bg-blue-50 px-1.5 py-0.5 rounded">
                                  Pass: {u.plain_password}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{u.gym_name || '-'}</span>
                            </td>
                            <td className="px-4 py-3">
                              {u.is_suspended ? (
                                <span className="tag bg-red-50 text-red-600">Suspended</span>
                              ) : (
                                <span className="tag bg-green-50 text-green-600">Active</span>
                              )}
                              {u.role === 'gym_admin' && (
                                <span className="tag bg-blue-50 text-blue-600 ml-1">Gym Admin</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {new Date(u.created_at).toLocaleDateString('ka-GE')}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setShowPasswordFor(showPasswordFor === u.id ? null : u.id)}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                                  title="Show password">
                                  <Eye size={14} />
                                </button>
                                <button
                                  onClick={() => { setEditingUser(editingUser === u.id ? null : u.id); setEditForm({ name: u.name, email: u.email, password: '', gym_id: u.gym_id || '' }); }}
                                  className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                                  <Pencil size={14} />
                                </button>
                                {u.role !== 'super_admin' && (
                                  <button
                                    onClick={() => handleSuspend(u.id, u.is_suspended)}
                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${u.is_suspended ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                    {u.is_suspended ? <><PlayCircle size={12} /> Restore</> : <><PauseCircle size={12} /> Suspend</>}
                                  </button>
                                )}
                                {u.role !== 'super_admin' && (
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
                                    <label className="label text-xs">Name</label>
                                    <input className="input text-sm py-1.5" value={editForm.name}
                                      onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                  </div>
                                  <div>
                                    <label className="label text-xs">Email</label>
                                    <input className="input text-sm py-1.5" value={editForm.email}
                                      onChange={e => setEditForm({...editForm, email: e.target.value})} />
                                  </div>
                                  <div>
                                    <label className="label text-xs">New Password</label>
                                    <input className="input text-sm py-1.5" type="text" placeholder="Leave empty to keep"
                                      value={editForm.password} onChange={e => setEditForm({...editForm, password: e.target.value})} />
                                  </div>
                                  {isSuperAdmin && (
                                    <div>
                                      <label className="label text-xs">Gym</label>
                                      <select className="input text-sm py-1.5" value={editForm.gym_id}
                                        onChange={e => setEditForm({...editForm, gym_id: e.target.value})}>
                                        <option value="">No gym</option>
                                        {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                      </select>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2 mt-2">
                                  <button onClick={() => handleEditUser(u.id)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">
                                    <Check size={12} /> Save
                                  </button>
                                  <button onClick={() => setEditingUser(null)}
                                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancel</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                  {users.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm">No users yet</div>
                  )}
                </div>
              </div>
            )}

            {tab === 'gyms' && (
              <div className="space-y-4">
                {showAddGym && isSuperAdmin && (
                  <div className="card border-2 border-primary-200 bg-primary-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">New Gym + Admin Account</h3>
                      <button onClick={() => setShowAddGym(false)}><X size={18} className="text-gray-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase">Gym Info</div>
                      <div>
                        <label className="label">Gym Name *</label>
                        <input className="input" placeholder="FitLife Tbilisi" value={gymForm.name}
                          onChange={e => setGymForm({...gymForm, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">Address</label>
                        <input className="input" placeholder="Tbilisi, Rustaveli 15" value={gymForm.address}
                          onChange={e => setGymForm({...gymForm, address: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">Logo URL</label>
                        <input className="input" placeholder="https://..." value={gymForm.logo_url}
                          onChange={e => setGymForm({...gymForm, logo_url: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">Photo URL</label>
                        <input className="input" placeholder="https://..." value={gymForm.photo_url}
                          onChange={e => setGymForm({...gymForm, photo_url: e.target.value})} />
                      </div>
                      <div className="col-span-2">
                        <label className="label">Description</label>
                        <input className="input" placeholder="About the gym..." value={gymForm.description}
                          onChange={e => setGymForm({...gymForm, description: e.target.value})} />
                      </div>
                      <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase mt-2">Gym Admin Account</div>
                      <div>
                        <label className="label">Admin Name *</label>
                        <input className="input" placeholder="Admin Name" value={gymForm.admin_name}
                          onChange={e => setGymForm({...gymForm, admin_name: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">Admin Email *</label>
                        <input className="input" type="email" placeholder="admin@gym.com" value={gymForm.admin_email}
                          onChange={e => setGymForm({...gymForm, admin_email: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">Admin Password *</label>
                        <input className="input" type="text" placeholder="Min 6 chars" value={gymForm.admin_password}
                          onChange={e => setGymForm({...gymForm, admin_password: e.target.value})} />
                      </div>
                    </div>
                    <button onClick={handleAddGym} className="btn-primary mt-4 flex items-center gap-2">
                      <Plus size={15} /> Add Gym & Create Admin
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
                          {g.admin_email && <p className="text-xs text-blue-400 mt-0.5">Admin: {g.admin_email}</p>}
                        </div>
                        {isSuperAdmin && (
                          <button onClick={() => handleDeleteGym(g.id)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="mt-3">
                        <span className={`tag text-xs ${g.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                          {g.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {gyms.length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-sm">No gyms added yet</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
