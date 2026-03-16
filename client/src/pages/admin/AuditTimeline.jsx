const ACTION_LABELS = {
  complete: 'Marked step complete',
  uncomplete: 'Marked step incomplete',
  tags_update: 'Updated tags',
  step_create: 'Created step',
  step_update: 'Updated step',
  step_delete: 'Deactivated step',
  step_restore: 'Restored step',
};

const ACTION_COLORS = {
  complete: 'bg-green-500',
  uncomplete: 'bg-red-400',
  tags_update: 'bg-purple-500',
  step_create: 'bg-csub-blue',
  step_update: 'bg-csub-blue',
  step_delete: 'bg-red-500',
  step_restore: 'bg-green-600',
};

function formatTime(ts) {
  const d = new Date(ts + 'Z');
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getDescription(log) {
  const details = log.details ? JSON.parse(log.details) : {};
  const label = ACTION_LABELS[log.action] || log.action;

  if (log.action === 'complete' || log.action === 'uncomplete') {
    const parts = [label];
    if (details.stepTitle) parts[0] += `: ${details.stepTitle}`;
    if (details.studentName) parts.push(`for ${details.studentName}`);
    return parts.join(' ');
  }

  if (log.action === 'tags_update') {
    if (details.studentName) return `${label} for ${details.studentName}`;
    return label;
  }

  if (details.title) return `${label}: ${details.title}`;
  return label;
}

export default function AuditTimeline({ logs }) {
  if (!logs || logs.length === 0) {
    return (
      <p className="font-body text-sm text-csub-gray text-center py-4">No audit entries yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const details = log.details ? JSON.parse(log.details) : {};
        return (
          <div key={log.id} className="flex gap-3 items-start">
            <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${ACTION_COLORS[log.action] || 'bg-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm text-csub-blue-dark">
                {getDescription(log)}
              </p>
              {details.note && (
                <p className="font-body text-xs text-csub-gray italic mt-0.5">
                  Note: {details.note}
                </p>
              )}
              <p className="font-body text-[10px] text-csub-gray mt-0.5">
                {formatTime(log.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
