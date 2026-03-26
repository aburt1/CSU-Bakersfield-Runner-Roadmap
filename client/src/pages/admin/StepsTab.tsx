import { useState, useCallback, useEffect, useRef, type ChangeEvent } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import StepForm from './StepForm';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface StepItem {
  id: number;
  title: string;
  description?: string;
  icon?: string;
  deadline?: string;
  is_active: number;
  is_public?: number;
  sort_order: number;
  required_tags?: string | string[];
}

interface DraggableStepRowProps {
  step: StepItem;
  index: number;
  totalVisible: number;
  canEdit: boolean;
  selected: boolean;
  editingStepId: number | undefined;
  onToggleSelect: () => void;
  onMoveStep: (index: number, direction: number) => void;
  onEdit: (step: StepItem) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => void;
  onSave: (data: any) => void;
  onCancelEdit: () => void;
}

interface Props {
  api: AdminApi;
  role?: string;
  termId: number | null;
}

// ─── Drag Handle Icon ────────────────────────────────────
function GripIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  );
}

// ─── Draggable Step Row ──────────────────────────────────
function DraggableStepRow({
  step, index, totalVisible, canEdit, selected, editingStepId,
  onToggleSelect, onMoveStep, onEdit, onDuplicate, onDelete, onRestore, onSave, onCancelEdit,
}: DraggableStepRowProps) {
  const dragControls = useDragControls();
  const isEditing = editingStepId === step.id;

  const content = (
    <>
      <div
        className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border shadow-sm transition-all hover:shadow-md ${
          step.is_active === 0
            ? 'border-gray-200 bg-gray-50 opacity-60'
            : 'border-gray-200 bg-white'
        }`}
      >
        {canEdit && (
          <>
            {/* Drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="cursor-grab active:cursor-grabbing touch-none text-gray-300 hover:text-csub-blue transition-colors flex-shrink-0"
              title="Drag to reorder"
            >
              <GripIcon />
            </div>

            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="rounded flex-shrink-0"
            />

            {/* Arrow buttons (keyboard accessibility fallback) */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => onMoveStep(index, -1)}
                disabled={index === 0}
                className="text-xs text-csub-gray hover:text-csub-blue disabled:opacity-30 transition-colors"
                title="Move up"
              >
                {'\u25B2'}
              </button>
              <button
                onClick={() => onMoveStep(index, 1)}
                disabled={index === totalVisible - 1}
                className="text-xs text-csub-gray hover:text-csub-blue disabled:opacity-30 transition-colors"
                title="Move down"
              >
                {'\u25BC'}
              </button>
            </div>
          </>
        )}

        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
          {step.icon || '\uD83D\uDCCB'}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-semibold text-csub-blue-dark truncate">
            {step.title}
            {step.is_public === 1 && (
              <span className="ml-2 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-body font-medium align-middle">
                Public
              </span>
            )}
          </p>
          <p className="font-body text-xs text-csub-gray truncate">
            {step.description || 'No description'}
            {step.deadline && <span className="text-amber-600 ml-1">{'\u2014'} {step.deadline}</span>}
          </p>
          {step.required_tags && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags).map((tag: string) => (
                <span key={tag} className="text-[10px] bg-csub-blue/10 text-csub-blue-dark px-1.5 py-0.5 rounded-full font-body">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(step)}
              className="font-body text-xs text-csub-blue hover:text-csub-blue-dark px-2 py-1 rounded hover:bg-csub-blue/5 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onDuplicate(step.id)}
              className="font-body text-xs text-csub-blue hover:text-csub-blue-dark px-2 py-1 rounded hover:bg-csub-blue/5 transition-colors"
            >
              Duplicate
            </button>
            {step.is_active === 0 ? (
              <button
                onClick={() => onRestore(step.id)}
                className="font-body text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50 transition-colors"
              >
                Restore
              </button>
            ) : (
              <button
                onClick={() => onDelete(step.id)}
                className="font-body text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {canEdit && isEditing && (
        <div className="mt-2 mb-4">
          <StepForm step={step} onSave={onSave} onCancel={onCancelEdit} />
        </div>
      )}
    </>
  );

  if (!canEdit) {
    return <div>{content}</div>;
  }

  return (
    <Reorder.Item
      value={step}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 25px rgba(0,0,0,0.12)', zIndex: 50 }}
      style={{ position: 'relative' }}
    >
      {content}
    </Reorder.Item>
  );
}

// ─── Steps Tab ───────────────────────────────────────────
export default function StepsTab({ api, role = 'viewer', termId }: Props) {
  const canEdit = role === 'admissions_editor' || role === 'sysadmin';
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStep, setEditingStep] = useState<Partial<StepItem> | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetchSteps = useCallback(async () => {
    try {
      const query = termId ? `/steps?term_id=${termId}` : '/steps';
      const data = await api.get(query);
      setSteps(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  const handleSave = async (data: any) => {
    try {
      if (editingStep?.id) {
        await api.put(`/steps/${editingStep.id}`, data);
      } else {
        await api.post('/steps', data);
      }
      setEditingStep(null);
      fetchSteps();
    } catch {
      alert('Failed to save step.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this step? Students will no longer see it.')) return;
    try {
      await api.del(`/steps/${id}`);
      fetchSteps();
    } catch { /* ignore */ }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.put(`/steps/${id}`, { is_active: 1 });
      fetchSteps();
    } catch { /* ignore */ }
  };

  const handleDuplicate = async (id: number) => {
    try {
      await api.post(`/steps/${id}/duplicate`);
      fetchSteps();
    } catch { /* ignore */ }
  };

  const moveStep = async (index: number, direction: number) => {
    const sorted = [...steps].sort((a, b) => a.sort_order - b.sort_order);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const order = sorted.map((s) => ({ id: s.id, sort_order: s.sort_order }));
    const tempOrder = order[index].sort_order;
    order[index].sort_order = order[swapIndex].sort_order;
    order[swapIndex].sort_order = tempOrder;

    try {
      await api.put('/steps/reorder', { order });
      fetchSteps();
    } catch { /* ignore */ }
  };

  // Drag-and-drop reorder handler — debounced API call
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDragReorder = (reorderedVisible: StepItem[]) => {
    // Optimistic local update on every frame (smooth visual)
    const updatedSteps = steps.map((s) => {
      const newIndex = reorderedVisible.findIndex((v) => v.id === s.id);
      return newIndex !== -1 ? { ...s, sort_order: newIndex + 1 } : s;
    });
    setSteps(updatedSteps);

    // Debounce the API save — only fires 500ms after dragging stops
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const order = reorderedVisible.map((s, i) => ({ id: s.id, sort_order: i + 1 }));
      api.put('/steps/reorder', { order }).catch(() => fetchSteps());
    }, 500);
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const sortedSteps = [...steps].sort((a, b) => a.sort_order - b.sort_order);
  const visibleSteps = showInactive ? sortedSteps : sortedSteps.filter((s) => s.is_active !== 0);
  const activeCount = steps.filter((s) => s.is_active !== 0).length;

  const toggleSelectAll = () => {
    if (selected.size === visibleSteps.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleSteps.map((s) => s.id)));
    }
  };

  const handleBulkAction = async (isActive: number) => {
    if (selected.size === 0) return;
    try {
      await api.put('/steps/bulk-status', { stepIds: [...selected], is_active: isActive });
      setSelected(new Set());
      fetchSteps();
    } catch { /* ignore */ }
  };

  if (loading) {
    return <p className="font-body text-sm text-csub-gray text-center py-8">Loading steps...</p>;
  }

  const stepRowProps = (step: StepItem, i: number) => ({
    step,
    index: i,
    totalVisible: visibleSteps.length,
    canEdit,
    selected: selected.has(step.id),
    editingStepId: editingStep?.id,
    onToggleSelect: () => toggleSelect(step.id),
    onMoveStep: moveStep,
    onEdit: setEditingStep,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onRestore: handleRestore,
    onSave: handleSave,
    onCancelEdit: () => setEditingStep(null),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
            Manage Steps
          </h2>
          <span className="font-body text-xs text-csub-gray bg-gray-100 rounded-full px-2.5 py-0.5">
            {activeCount} active
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 font-body text-xs text-csub-gray cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Show inactive
          </label>
          {canEdit && (
            <button
              onClick={() => setEditingStep({})}
              className="flex items-center gap-1.5 bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-4 py-2 rounded-lg shadow transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Step
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-csub-blue/5 border border-csub-blue/20 rounded-xl px-4 py-2.5">
          <span className="font-body text-sm text-csub-blue-dark font-semibold">
            {selected.size} selected
          </span>
          <button
            onClick={() => handleBulkAction(1)}
            className="font-body text-xs text-green-700 hover:text-green-900 font-semibold transition-colors"
          >
            Activate
          </button>
          <button
            onClick={() => handleBulkAction(0)}
            className="font-body text-xs text-red-600 hover:text-red-800 font-semibold transition-colors"
          >
            Deactivate
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="font-body text-xs text-csub-gray hover:text-csub-blue-dark ml-auto transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {canEdit && editingStep && !editingStep.id && (
        <div className="mb-6">
          <StepForm step={null} onSave={handleSave} onCancel={() => setEditingStep(null)} />
        </div>
      )}

      {/* Select all */}
      {canEdit && visibleSteps.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <input
            type="checkbox"
            checked={selected.size === visibleSteps.length && visibleSteps.length > 0}
            onChange={toggleSelectAll}
            className="rounded"
          />
          <span className="font-body text-xs text-csub-gray">Select all</span>
          {canEdit && (
            <span className="font-body text-[10px] text-csub-gray/60 ml-2">
              Drag the grip handle to reorder
            </span>
          )}
        </div>
      )}

      {/* Step list — draggable when canEdit */}
      {canEdit ? (
        <Reorder.Group
          axis="y"
          values={visibleSteps}
          onReorder={handleDragReorder}
          className="space-y-2"
        >
          {visibleSteps.map((step, i) => (
            <DraggableStepRow key={step.id} {...stepRowProps(step, i)} />
          ))}
        </Reorder.Group>
      ) : (
        <div className="space-y-2">
          {visibleSteps.map((step, i) => (
            <DraggableStepRow key={step.id} {...stepRowProps(step, i)} />
          ))}
        </div>
      )}

      {visibleSteps.length === 0 && (
        <p className="font-body text-sm text-csub-gray text-center py-8">No steps yet. Create one above.</p>
      )}
    </div>
  );
}
