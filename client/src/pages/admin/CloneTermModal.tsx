import { useEffect, useMemo, useState, type FormEvent, type ChangeEvent } from 'react';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface Term {
  id: number;
  name: string;
  is_active: number;
  start_date: string;
  end_date: string;
}

interface Step {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
}

interface CloneResult {
  term: Term;
  steps: Step[];
}

interface Props {
  open: boolean;
  terms: Term[];
  api: AdminApi;
  defaultSourceTermId: number | null;
  onClose: () => void;
  onCloned: (result: CloneResult) => void;
}

export default function CloneTermModal({ open, terms, api, defaultSourceTermId, onClose, onCloned }: Props) {
  const [sourceTermId, setSourceTermId] = useState<number | null>(defaultSourceTermId || terms[0]?.id || null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedStepIds, setSelectedStepIds] = useState<Set<number>>(new Set());
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSourceTermId(defaultSourceTermId || terms[0]?.id || null);
    setName('');
    setStartDate('');
    setEndDate('');
    setError('');
  }, [open, defaultSourceTermId, terms]);

  useEffect(() => {
    if (!open || !sourceTermId) return;
    setLoadingSteps(true);
    api.get(`/steps?term_id=${sourceTermId}`).then((data: Step[]) => {
      setSteps(data);
      setSelectedStepIds(new Set(data.map((step) => step.id)));
    }).catch((err: any) => {
      setError(err.message || 'Failed to load steps');
    }).finally(() => setLoadingSteps(false));
  }, [api, open, sourceTermId]);

  const selectedCount = selectedStepIds.size;
  const allSelected = steps.length > 0 && selectedCount === steps.length;

  const sourceTerm = useMemo(
    () => terms.find((term) => term.id === sourceTermId) || null,
    [terms, sourceTermId]
  );

  if (!open) return null;

  const toggleStep = (stepId: number) => {
    setSelectedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api.post(`/terms/${sourceTermId}/clone`, {
        name,
        start_date: startDate || null,
        end_date: endDate || null,
        step_ids: [...selectedStepIds],
      });
      onCloned(result);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to clone term');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-csub-blue-dark/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
              Clone Term
            </h3>
            <p className="font-body text-sm text-csub-gray mt-1">
              Create a new term by copying selected steps from an existing one.
            </p>
          </div>
          <button onClick={onClose} className="text-csub-gray hover:text-csub-blue-dark transition-colors">Close</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Source Term</label>
              <select
                value={sourceTermId || ''}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSourceTermId(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue bg-white"
              >
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>{term.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">New Term Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
                placeholder="Fall 2027"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
              <div>
                <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
                />
              </div>
              <div>
                <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="font-body text-sm font-semibold text-csub-blue-dark">
                  {sourceTerm?.name || 'Source term'} steps
                </p>
                <p className="font-body text-xs text-csub-gray">
                  Select which steps to copy into the new term.
                </p>
              </div>
              {steps.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedStepIds(allSelected ? new Set() : new Set(steps.map((step) => step.id)))}
                  className="font-body text-xs text-csub-blue hover:text-csub-blue-dark transition-colors"
                >
                  {allSelected ? 'Select None' : 'Select All'}
                </button>
              )}
            </div>

            {loadingSteps ? (
              <p className="font-body text-sm text-csub-gray">Loading steps...</p>
            ) : steps.length === 0 ? (
              <p className="font-body text-sm text-csub-gray">No steps available in this term.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {steps.map((step) => (
                  <label key={step.id} className="flex items-start gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStepIds.has(step.id)}
                      onChange={() => toggleStep(step.id)}
                      className="mt-1 rounded"
                    />
                    <div className="min-w-0">
                      <p className="font-body text-sm font-semibold text-csub-blue-dark">
                        {step.icon || '\uD83D\uDCCB'} {step.title}
                      </p>
                      <p className="font-body text-xs text-csub-gray truncate">
                        {step.description || 'No description'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <p className="font-body text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || selectedCount === 0}
              className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display text-sm font-bold uppercase tracking-wider px-5 py-2 rounded-lg shadow transition-colors disabled:opacity-50"
            >
              {saving ? 'Cloning...' : `Clone ${selectedCount} Step${selectedCount === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="font-body text-sm text-csub-gray hover:text-csub-blue-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
