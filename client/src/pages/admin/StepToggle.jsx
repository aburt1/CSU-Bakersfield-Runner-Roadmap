import { useState } from 'react';
import NoteModal from './NoteModal';

export default function StepToggle({ studentId, stepId, stepTitle, stepIcon, completed, completedAt, api, onToggle }) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleClick = () => {
    setShowModal(true);
  };

  const handleConfirm = async (note) => {
    setShowModal(false);
    setLoading(true);
    try {
      if (completed) {
        await api.del(`/students/${studentId}/steps/${stepId}/complete`, { note });
      } else {
        await api.post(`/students/${studentId}/steps/${stepId}/complete`, { note });
      }
      onToggle(stepId, !completed);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border text-left transition-all duration-150 disabled:opacity-50 ${
          completed
            ? 'border-csub-gold bg-csub-gold-light/30'
            : 'border-gray-200 bg-white hover:border-csub-blue/30'
        }`}
      >
        <div
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
            completed
              ? 'bg-csub-gold border-csub-gold text-csub-blue-dark'
              : 'border-gray-300 text-transparent'
          }`}
        >
          {completed ? '✓' : ''}
        </div>
        <span className="text-base" aria-hidden="true">{stepIcon}</span>
        <div className="flex-1 min-w-0">
          <span className={`font-body text-sm ${completed ? 'text-csub-blue-dark font-semibold' : 'text-csub-gray'}`}>
            {stepTitle}
          </span>
          {completed && completedAt && (
            <p className="font-body text-[10px] text-csub-gray mt-0.5">
              Completed {new Date(completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      </button>

      {showModal && (
        <NoteModal
          stepTitle={stepTitle}
          stepIcon={stepIcon}
          action={completed ? 'uncomplete' : 'complete'}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  );
}
