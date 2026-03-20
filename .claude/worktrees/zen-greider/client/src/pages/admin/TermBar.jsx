export default function TermBar({
  selectedTermName,
  onNewTerm,
  onCloneTerm,
  canEdit,
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">
            Terms and Steps
          </p>
          <p className="font-body text-sm text-csub-gray mt-1">
            {selectedTermName
              ? `Showing configuration for ${selectedTermName}. Change the term in the header to switch context.`
              : 'Select a term in the header to manage its steps.'}
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={onNewTerm}
              className="flex items-center gap-1.5 bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-4 py-2 rounded-lg shadow transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Term
            </button>
            <button
              onClick={onCloneTerm}
              disabled={!selectedTermName}
              className="border border-csub-blue/20 text-csub-blue hover:bg-csub-blue/5 font-display font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors text-sm disabled:opacity-40"
            >
              Clone Term
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
