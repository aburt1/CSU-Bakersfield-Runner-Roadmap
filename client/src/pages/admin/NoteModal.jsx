import { useState } from 'react';

export default function NoteModal({ stepTitle, stepIcon, action, onConfirm, onCancel }) {
  const [note, setNote] = useState('');

  const isComplete = action === 'complete';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-3">
          {isComplete ? 'Mark Complete' : 'Mark Incomplete'}
        </h3>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">{stepIcon || '📋'}</span>
          <span className="font-body text-sm text-csub-blue-dark font-semibold">{stepTitle}</span>
        </div>
        <label className="block font-body text-xs font-semibold text-csub-gray mb-1">
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Reason for this change..."
          className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-1 focus:ring-csub-blue mb-4 resize-none"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="border border-gray-300 text-csub-gray hover:text-csub-blue-dark font-body text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note.trim() || null)}
            className={`font-display font-bold text-sm uppercase tracking-wider px-4 py-2 rounded-lg shadow transition-colors ${
              isComplete
                ? 'bg-csub-blue hover:bg-csub-blue-dark text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
