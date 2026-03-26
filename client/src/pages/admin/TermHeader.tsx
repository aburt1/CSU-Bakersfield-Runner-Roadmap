import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react';

interface Term {
  id: number;
  name: string;
  is_active: number;
  start_date: string;
  end_date: string;
  step_count?: number;
  student_count?: number;
}

interface TermForm {
  name: string;
  start_date: string;
  end_date: string;
}

interface Props {
  term: Term | null;
  canEdit: boolean;
  onSave: (termId: number, data: Partial<TermForm & { is_active: number }>) => Promise<void>;
  onDelete: (term: Term) => void;
}

export default function TermHeader({ term, canEdit, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<TermForm>({ name: '', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!term) return;
    setForm({
      name: term.name || '',
      start_date: term.start_date || '',
      end_date: term.end_date || '',
    });
    setEditing(false);
    setError('');
  }, [term]);

  if (!term) return null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(term.id, form);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save term');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Term Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
              />
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
              />
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
              />
            </div>
          </div>
          {error && <p className="font-body text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display text-sm font-bold uppercase tracking-wider px-5 py-2 rounded-lg shadow transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Term'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="font-body text-sm text-csub-gray hover:text-csub-blue-dark transition-colors">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl font-bold text-csub-blue-dark uppercase tracking-wide">{term.name}</h2>
              {term.is_active ? (
                <span className="text-[10px] font-body font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">Active</span>
              ) : (
                <span className="text-[10px] font-body font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">Inactive</span>
              )}
            </div>
            <p className="font-body text-sm text-csub-gray mt-1">{term.start_date || 'No start date'} - {term.end_date || 'No end date'}</p>
            <p className="font-body text-xs text-csub-gray mt-1">{term.step_count || 0} steps · {term.student_count || 0} students</p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {!term.is_active && (
                <button onClick={() => onSave(term.id, { is_active: 1 })} className="font-body text-xs font-semibold text-green-700 hover:text-green-900 px-2 py-1 rounded transition-colors">
                  Set Active
                </button>
              )}
              <button onClick={() => setEditing(true)} className="font-body text-xs text-csub-blue hover:text-csub-blue-dark px-2 py-1 rounded transition-colors">
                Edit Term
              </button>
              <button onClick={() => onDelete(term)} className="font-body text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded transition-colors">
                Delete Term
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
