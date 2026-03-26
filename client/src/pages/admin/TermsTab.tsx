import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface TermItem {
  id: number;
  name: string;
  is_active: number;
  start_date: string;
  end_date: string;
  student_count?: number;
  step_count?: number;
}

interface TermForm {
  name: string;
  start_date: string;
  end_date: string;
}

interface Props {
  api: AdminApi;
  onTermsChange?: (terms: TermItem[]) => void;
}

export default function TermsTab({ api, onTermsChange }: Props) {
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TermForm>({ name: '', start_date: '', end_date: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTerms = () => {
    api.get('/terms').then((data: TermItem[]) => {
      setTerms(data);
      onTermsChange?.(data);
    }).catch(() => {});
  };

  useEffect(() => { loadTerms(); }, [api]);

  const resetForm = () => {
    setForm({ name: '', start_date: '', end_date: '' });
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/terms/${editingId}`, form);
      } else {
        await api.post('/terms', form);
      }
      resetForm();
      loadTerms();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (term: TermItem) => {
    setForm({ name: term.name, start_date: term.start_date || '', end_date: term.end_date || '' });
    setEditingId(term.id);
    setShowForm(true);
  };

  const toggleActive = async (term: TermItem) => {
    try {
      await api.put(`/terms/${term.id}`, { is_active: term.is_active ? 0 : 1 });
      loadTerms();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
            Admission Terms
          </h2>
          <p className="font-body text-xs text-csub-gray mt-1">Manage enrollment periods and their date ranges</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 bg-csub-blue hover:bg-csub-blue-dark text-white font-display text-sm font-bold uppercase tracking-wider px-4 py-2 rounded-lg shadow transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Term
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-csub-blue-dark">
            {editingId ? 'Edit Term' : 'Create Term'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              type="text"
              required
              placeholder="Term Name (e.g. Fall 2027)"
              value={form.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
            />
            <div>
              <label className="font-body text-xs text-csub-gray block mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
              />
            </div>
            <div>
              <label className="font-body text-xs text-csub-gray block mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
              />
            </div>
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
            <button type="button" onClick={resetForm} className="font-body text-sm text-csub-gray hover:text-csub-blue-dark transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {terms.map((term) => (
          <div
            key={term.id}
            className={`flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 ${
              !term.is_active ? 'opacity-50' : ''
            }`}
          >
            <div>
              <div className="flex items-center gap-3">
                <p className="font-body text-sm font-semibold text-csub-blue-dark">{term.name}</p>
                {term.is_active ? (
                  <span className="text-[10px] font-body font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">Active</span>
                ) : (
                  <span className="text-[10px] font-body font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">Inactive</span>
                )}
              </div>
              <p className="font-body text-xs text-csub-gray mt-0.5">
                {term.start_date || '?'} {'\u2014'} {term.end_date || '?'}
                <span className="ml-3">{term.student_count} students</span>
                <span className="ml-3">{term.step_count} steps</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => startEdit(term)} className="font-body text-xs text-csub-blue hover:text-csub-blue-dark transition-colors">Edit</button>
              <button
                onClick={() => toggleActive(term)}
                className={`font-body text-xs transition-colors ${
                  term.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'
                }`}
              >
                {term.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
