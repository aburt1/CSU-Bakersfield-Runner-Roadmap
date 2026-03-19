import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import StepForm from './StepForm';
import TermBar from './TermBar';
import TermHeader from './TermHeader';
import CloneTermModal from './CloneTermModal';

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

function DraggableStepRow({
  step, index, totalVisible, canEdit, selected, editingStepId,
  onToggleSelect, onMoveStep, onEdit, onDuplicate, onDelete, onRestore, onSave, onCancelEdit, selectedTermId,
}) {
  const dragControls = useDragControls();
  const isEditing = editingStepId === step.id;

  const content = (
    <>
      <div
        className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border shadow-sm transition-all hover:shadow-md ${
          step.is_active === 0 ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'
        }`}
      >
        {canEdit && (
          <>
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="cursor-grab active:cursor-grabbing touch-none text-gray-300 hover:text-csub-blue transition-colors flex-shrink-0"
              title="Drag to reorder"
            >
              <GripIcon />
            </div>

            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="rounded flex-shrink-0" />

            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => onMoveStep(index, -1)}
                disabled={index === 0}
                className="text-xs text-csub-gray hover:text-csub-blue disabled:opacity-30 transition-colors"
                title="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => onMoveStep(index, 1)}
                disabled={index === totalVisible - 1}
                className="text-xs text-csub-gray hover:text-csub-blue disabled:opacity-30 transition-colors"
                title="Move down"
              >
                ▼
              </button>
            </div>
          </>
        )}

        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
          {step.icon || '📋'}
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
            {step.deadline && <span className="text-amber-600 ml-1">- {step.deadline}</span>}
          </p>
          {step.required_tags && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[10px] bg-csub-blue/5 text-csub-blue-dark px-1.5 py-0.5 rounded-full font-body">
                match {step.required_tag_mode === 'all' ? 'all' : 'any'}
              </span>
              {(typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags).map((tag) => (
                <span key={tag} className="text-[10px] bg-csub-blue/10 text-csub-blue-dark px-1.5 py-0.5 rounded-full font-body">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {step.excluded_tags && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full font-body">
                hide if
              </span>
              {(typeof step.excluded_tags === 'string' ? JSON.parse(step.excluded_tags) : step.excluded_tags).map((tag) => (
                <span key={tag} className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full font-body">
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
          <StepForm
            step={step}
            selectedTermId={selectedTermId}
            onSave={onSave}
            onCancel={onCancelEdit}
          />
        </div>
      )}
    </>
  );

  if (!canEdit) return <div>{content}</div>;

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

export default function TermStepsTab({ api, role = 'viewer', terms, selectedTermId, onTermsChange, onSelectTerm }) {
  const canEdit = role === 'admissions_editor' || role === 'sysadmin';
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingStep, setEditingStep] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showCloneModal, setShowCloneModal] = useState(false);
  const saveTimerRef = useRef(null);

  const selectedTerm = useMemo(
    () => terms.find((term) => term.id === selectedTermId) || null,
    [terms, selectedTermId]
  );

  const refreshTerms = useCallback(async (nextSelectedTermId = selectedTermId) => {
    const data = await api.get('/terms');
    onTermsChange(data, nextSelectedTermId);
    return data;
  }, [api, onTermsChange, selectedTermId]);

  const fetchSteps = useCallback(async () => {
    if (!selectedTermId) {
      setSteps([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await api.get(`/steps?term_id=${selectedTermId}`);
      setSteps(data);
    } catch {
      setSteps([]);
    } finally {
      setLoading(false);
    }
  }, [api, selectedTermId]);

  useEffect(() => {
    fetchSteps();
  }, [fetchSteps]);

  const handleSaveStep = async (data) => {
    try {
      if (editingStep?.id) {
        await api.put(`/steps/${editingStep.id}`, data);
      } else {
        await api.post('/steps', data);
      }
      setEditingStep(null);
      await fetchSteps();
      await refreshTerms();
    } catch (err) {
      alert(err.message || 'Failed to save step.');
    }
  };

  const handleDeleteStep = async (id) => {
    if (!confirm('Deactivate this step? Students will no longer see it.')) return;
    try {
      await api.del(`/steps/${id}`);
      await fetchSteps();
      await refreshTerms();
    } catch {
      // ignore
    }
  };

  const handleRestoreStep = async (id) => {
    try {
      await api.put(`/steps/${id}`, { is_active: 1 });
      await fetchSteps();
      await refreshTerms();
    } catch {
      // ignore
    }
  };

  const handleDuplicateStep = async (id) => {
    try {
      await api.post(`/steps/${id}/duplicate`);
      await fetchSteps();
      await refreshTerms();
    } catch {
      // ignore
    }
  };

  const moveStep = async (index, direction) => {
    const sorted = [...steps].sort((a, b) => a.sort_order - b.sort_order);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const order = sorted.map((step) => ({ id: step.id, sort_order: step.sort_order }));
    const tempOrder = order[index].sort_order;
    order[index].sort_order = order[swapIndex].sort_order;
    order[swapIndex].sort_order = tempOrder;

    try {
      await api.put('/steps/reorder', { order });
      await fetchSteps();
    } catch {
      // ignore
    }
  };

  const handleDragReorder = (reorderedVisible) => {
    const updatedSteps = steps.map((step) => {
      const newIndex = reorderedVisible.findIndex((visible) => visible.id === step.id);
      return newIndex !== -1 ? { ...step, sort_order: newIndex + 1 } : step;
    });
    setSteps(updatedSteps);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const order = reorderedVisible.map((step, index) => ({ id: step.id, sort_order: index + 1 }));
      api.put('/steps/reorder', { order }).catch(() => fetchSteps());
    }, 500);
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sortedSteps = [...steps].sort((a, b) => a.sort_order - b.sort_order);
  const visibleSteps = showInactive ? sortedSteps : sortedSteps.filter((step) => step.is_active !== 0);
  const activeCount = steps.filter((step) => step.is_active !== 0).length;

  const toggleSelectAll = () => {
    if (selected.size === visibleSteps.length) setSelected(new Set());
    else setSelected(new Set(visibleSteps.map((step) => step.id)));
  };

  const handleBulkAction = async (isActive) => {
    if (selected.size === 0) return;
    try {
      await api.put('/steps/bulk-status', { stepIds: [...selected], is_active: isActive });
      setSelected(new Set());
      await fetchSteps();
      await refreshTerms();
    } catch {
      // ignore
    }
  };

  const handleCreateTerm = async () => {
    const name = window.prompt('New term name');
    if (!name) return;

    try {
      const result = await api.post('/terms', { name });
      const data = await refreshTerms(result.id);
      const createdTerm = data.find((term) => term.id === result.id);
      if (createdTerm) onSelectTerm(createdTerm.id);
    } catch (err) {
      alert(err.message || 'Failed to create term.');
    }
  };

  const handleSaveTerm = async (termId, data) => {
    await api.put(`/terms/${termId}`, data);
    const refreshed = await refreshTerms(termId);
    const term = refreshed.find((item) => item.id === termId);
    if (term) onSelectTerm(term.id);
  };

  const handleDeleteTerm = async (term) => {
    if (term.student_count > 0) {
      alert('This term still has students assigned and cannot be deleted.');
      return;
    }
    if (!confirm(`Delete ${term.name}? All steps in this term will be removed.`)) return;

    try {
      await api.del(`/terms/${term.id}`);
      const refreshed = await refreshTerms();
      const nextTerm = refreshed.find((item) => item.is_active) || refreshed[0] || null;
      onSelectTerm(nextTerm?.id || null);
    } catch (err) {
      alert(err.message || 'Failed to delete term.');
    }
  };

  const handleCloned = async (result) => {
    const refreshed = await refreshTerms(result.term.id);
    const term = refreshed.find((item) => item.id === result.term.id);
    onSelectTerm(term?.id || result.term.id);
    setSteps(result.steps || []);
  };

  const stepRowProps = (step, index) => ({
    step,
    index,
    totalVisible: visibleSteps.length,
    canEdit,
    selected: selected.has(step.id),
    editingStepId: editingStep?.id,
    onToggleSelect: () => toggleSelect(step.id),
    onMoveStep: moveStep,
    onEdit: setEditingStep,
    onDuplicate: handleDuplicateStep,
    onDelete: handleDeleteStep,
    onRestore: handleRestoreStep,
    onSave: handleSaveStep,
    onCancelEdit: () => setEditingStep(null),
    selectedTermId,
  });

  return (
    <div className="space-y-5">
      <TermBar
        selectedTermName={selectedTerm?.name || ''}
        onNewTerm={handleCreateTerm}
        onCloneTerm={() => setShowCloneModal(true)}
        canEdit={canEdit}
      />

      <TermHeader
        term={selectedTerm}
        canEdit={canEdit}
        onSave={handleSaveTerm}
        onDelete={handleDeleteTerm}
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
              {selectedTerm ? `${selectedTerm.name} Steps` : 'Manage Steps'}
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
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded"
              />
              Show inactive
            </label>
            {canEdit && (
              <button
                onClick={() => setEditingStep({ term_id: selectedTermId })}
                disabled={!selectedTermId}
                className="flex items-center gap-1.5 bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-4 py-2 rounded-lg shadow transition-colors text-sm disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Step
              </button>
            )}
          </div>
        </div>

        {canEdit && selected.size > 0 && (
          <div className="flex items-center gap-3 mb-4 bg-csub-blue/5 border border-csub-blue/20 rounded-xl px-4 py-2.5">
            <span className="font-body text-sm text-csub-blue-dark font-semibold">{selected.size} selected</span>
            <button onClick={() => handleBulkAction(1)} className="font-body text-xs text-green-700 hover:text-green-900 font-semibold transition-colors">
              Activate
            </button>
            <button onClick={() => handleBulkAction(0)} className="font-body text-xs text-red-600 hover:text-red-800 font-semibold transition-colors">
              Deactivate
            </button>
            <button onClick={() => setSelected(new Set())} className="font-body text-xs text-csub-gray hover:text-csub-blue-dark ml-auto transition-colors">
              Clear
            </button>
          </div>
        )}

        {canEdit && editingStep && !editingStep.id && (
          <div className="mb-6">
            <StepForm
              step={null}
              selectedTermId={selectedTermId}
              onSave={handleSaveStep}
              onCancel={() => setEditingStep(null)}
            />
          </div>
        )}

        {loading ? (
          <p className="font-body text-sm text-csub-gray text-center py-8">Loading steps...</p>
        ) : (
          <>
            {canEdit && visibleSteps.length > 0 && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <input
                  type="checkbox"
                  checked={selected.size === visibleSteps.length && visibleSteps.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
                <span className="font-body text-xs text-csub-gray">Select all</span>
                <span className="font-body text-[10px] text-csub-gray/60 ml-2">Drag the grip handle to reorder</span>
              </div>
            )}

            {visibleSteps.length > 0 ? (
              canEdit ? (
                <Reorder.Group axis="y" values={visibleSteps} onReorder={handleDragReorder} className="space-y-2">
                  {visibleSteps.map((step, index) => (
                    <DraggableStepRow key={step.id} {...stepRowProps(step, index)} />
                  ))}
                </Reorder.Group>
              ) : (
                <div className="space-y-2">
                  {visibleSteps.map((step, index) => (
                    <DraggableStepRow key={step.id} {...stepRowProps(step, index)} />
                  ))}
                </div>
              )
            ) : (
              <div className="text-center py-10">
                <p className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
                  No steps yet
                </p>
                <p className="font-body text-sm text-csub-gray mt-1">
                  Add one or clone from another term.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <CloneTermModal
        open={showCloneModal}
        terms={terms}
        api={api}
        defaultSourceTermId={selectedTermId}
        onClose={() => setShowCloneModal(false)}
        onCloned={handleCloned}
      />
    </div>
  );
}
