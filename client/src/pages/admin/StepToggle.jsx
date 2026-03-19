import { useState } from 'react';
import NoteModal from './NoteModal';

export default function StepToggle({ studentId, stepId, stepTitle, stepIcon, status, completedAt, note: savedNote, api, onToggle, readOnly = false, isOptional = false }) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(null); // null | 'complete' | 'waive' | 'uncomplete'

  const isDone = status === 'completed' || status === 'waived';

  const handleConfirm = async (note) => {
    const action = showModal;
    setShowModal(null);
    setLoading(true);
    try {
      if (action === 'uncomplete') {
        await api.del(`/students/${studentId}/steps/${stepId}/complete`, { note });
        onToggle(stepId, null);
      } else {
        const progressStatus = action === 'waive' ? 'waived' : 'completed';
        await api.post(`/students/${studentId}/steps/${stepId}/complete`, { note, status: progressStatus });
        onToggle(stepId, progressStatus);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className={`rounded-xl border transition-all duration-150 ${
          status === 'completed'
            ? 'border-csub-gold bg-csub-gold-light/30'
            : status === 'waived'
            ? 'border-slate-300 bg-slate-50'
            : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Status indicator */}
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              status === 'completed'
                ? 'bg-csub-gold border-csub-gold text-csub-blue-dark'
                : status === 'waived'
                ? 'bg-slate-200 border-slate-300 text-slate-500'
                : 'border-gray-300 text-transparent'
            }`}
          >
            {status === 'completed' ? '✓' : status === 'waived' ? '—' : ''}
          </div>

          <span className="text-base flex-shrink-0" aria-hidden="true">{stepIcon}</span>

          <div className="flex-1 min-w-0">
            <span className={`font-body text-sm ${isDone ? 'text-csub-blue-dark font-semibold' : 'text-csub-gray'}`}>
              {stepTitle}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              {isOptional && (
                <span className="inline-flex items-center text-[10px] font-body font-semibold text-csub-blue bg-csub-blue/10 rounded px-1.5 py-0.5">
                  Optional
                </span>
              )}
              {status === 'completed' && (
                <span className="inline-flex items-center text-[10px] font-body font-semibold text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
                  Completed
                </span>
              )}
              {status === 'waived' && (
                <span className="inline-flex items-center text-[10px] font-body font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                  Waived
                </span>
              )}
              {isDone && completedAt && (
                <span className="font-body text-[10px] text-csub-gray">
                  {new Date(completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
            {savedNote && (
              <p className="font-body text-[10px] text-csub-gray/70 mt-0.5 italic truncate">
                Note: {savedNote}
              </p>
            )}
          </div>

          {/* Action buttons */}
          {!readOnly && <div className="flex items-center gap-1 flex-shrink-0">
            {isDone ? (
              <button
                onClick={() => setShowModal('uncomplete')}
                disabled={loading}
                className="font-body text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Undo
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowModal('complete')}
                  disabled={loading}
                  className="font-body text-xs text-csub-blue hover:text-csub-blue-dark font-semibold px-2 py-1 rounded hover:bg-csub-blue/5 transition-colors disabled:opacity-50"
                >
                  Complete
                </button>
                <button
                  onClick={() => setShowModal('waive')}
                  disabled={loading}
                  className="font-body text-xs text-slate-500 hover:text-slate-700 font-semibold px-2 py-1 rounded hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Waive
                </button>
              </>
            )}
          </div>}
        </div>
      </div>

      {showModal && (
        <NoteModal
          stepTitle={stepTitle}
          stepIcon={stepIcon}
          action={showModal}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(null)}
        />
      )}
    </>
  );
}
