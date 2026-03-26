import { useState, useEffect } from 'react';
import { ROLES, ROLE_OPTIONS, ROLE_COLORS_LIGHT } from './roleConfig';

export default function AdminUsersTab({ api }) {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ email: '', displayName: '', role: 'viewer' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = () => {
    api.get('/users').then(setUsers).catch(() => {});
  };

  useEffect(() => { loadUsers(); }, [api]);

  const resetForm = () => {
    setForm({ email: '', displayName: '', role: 'viewer' });
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, { displayName: form.displayName, role: form.role });
      } else {
        await api.post('/users', { email: form.email, displayName: form.displayName, role: form.role });
      }
      resetForm();
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (user) => {
    setForm({ email: user.email, displayName: user.display_name, role: user.role });
    setEditingId(user.id);
    setShowForm(true);
  };

  const toggleActive = async (user) => {
    try {
      await api.put(`/users/${user.id}`, { is_active: user.is_active ? 0 : 1 });
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
            Admin Users
          </h2>
          <p className="font-body text-xs text-csub-gray mt-1">Manage who can access the admin portal and their permission level</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 bg-csub-blue hover:bg-csub-blue-dark text-white font-display text-sm font-bold uppercase tracking-wider px-4 py-2 rounded-lg shadow transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New User
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-csub-blue-dark">
            {editingId ? 'Edit User' : 'Create User'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              placeholder="Display Name"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
            />
            <input
              type="email"
              required={!editingId}
              disabled={!!editingId}
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue disabled:bg-gray-100"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLES[r]?.label || r}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-red-600 text-sm font-body">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display text-sm font-bold uppercase tracking-wider px-5 py-2 rounded-lg shadow transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="font-body text-sm text-csub-gray hover:text-csub-blue-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 ${
              !user.is_active ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-csub-blue/10 flex items-center justify-center font-display text-sm font-bold text-csub-blue-dark">
                {user.display_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-body text-sm font-semibold text-gray-900">{user.display_name}</p>
                <p className="font-body text-xs text-csub-gray">{user.email}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-body font-medium ${ROLE_COLORS_LIGHT[user.role] || 'bg-gray-100 text-gray-600'}`}>
                {ROLES[user.role]?.label || user.role}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => startEdit(user)}
                className="font-body text-xs text-csub-blue hover:text-csub-blue-dark transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => toggleActive(user)}
                className={`font-body text-xs transition-colors ${
                  user.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'
                }`}
              >
                {user.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
