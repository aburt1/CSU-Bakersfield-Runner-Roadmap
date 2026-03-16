import { useState, useEffect } from 'react';
import TagEditor from './TagEditor';
import StepToggle from './StepToggle';
import AuditTimeline from './AuditTimeline';

export default function StudentDetail({ student, steps, api, onProgressChange }) {
  const [progress, setProgress] = useState(new Map());
  const [studentTags, setStudentTags] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [createdAt, setCreatedAt] = useState(null);

  useEffect(() => {
    if (!student) return;

    api.get(`/students/${student.id}/progress`).then((data) => {
      const map = new Map();
      for (const p of data.progress) {
        map.set(p.step_id, p.completed_at);
      }
      setProgress(map);
      setStudentTags(data.student?.tags ? JSON.parse(data.student.tags) : []);
      setCreatedAt(data.student?.created_at || null);
    }).catch(() => {});

    api.get(`/audit?studentId=${student.id}&limit=20`).then((data) => {
      setAuditLogs(data.logs);
    }).catch(() => {});
  }, [student, api]);

  const handleStepToggle = (stepId, completed) => {
    setProgress((prev) => {
      const next = new Map(prev);
      if (completed) {
        next.set(stepId, new Date().toISOString());
      } else {
        next.delete(stepId);
      }
      return next;
    });
    onProgressChange?.();
    // Refresh audit
    api.get(`/audit?studentId=${student.id}&limit=20`).then((data) => {
      setAuditLogs(data.logs);
    }).catch(() => {});
  };

  const saveTags = async (newTags) => {
    setStudentTags(newTags);
    try {
      await api.put(`/students/${student.id}/tags`, { tags: newTags });
      // Refresh audit
      const data = await api.get(`/audit?studentId=${student.id}&limit=20`);
      setAuditLogs(data.logs);
    } catch { /* ignore */ }
  };

  if (!student) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="font-body text-sm text-csub-gray">
          Select a student to manage their progress and tags.
        </p>
      </div>
    );
  }

  const completedCount = progress.size;
  const totalCount = steps.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide mb-1">
        {student.display_name}
      </h2>
      <p className="font-body text-sm text-csub-gray">{student.email}</p>
      {createdAt && (
        <p className="font-body text-xs text-csub-gray mt-0.5">
          Registered {new Date(createdAt + 'Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {/* Tags */}
      <div className="mt-3 mb-4">
        <label className="font-body text-xs font-semibold text-csub-blue-dark block mb-1">Student Tags</label>
        <TagEditor tags={studentTags} onChange={saveTags} />
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="font-body text-xs text-csub-blue font-semibold">
            {completedCount} of {totalCount} steps completed
          </span>
          <span className="font-display text-sm font-bold text-csub-gold">{pct}%</span>
        </div>
        <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-csub-gold rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Steps checklist */}
      <div className="space-y-2 mb-6">
        {steps.map((step) => (
          <StepToggle
            key={step.id}
            studentId={student.id}
            stepId={step.id}
            stepTitle={step.title}
            stepIcon={step.icon || '📋'}
            completed={progress.has(step.id)}
            completedAt={progress.get(step.id) || null}
            api={api}
            onToggle={handleStepToggle}
          />
        ))}
      </div>

      {/* Audit history */}
      <div>
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-3">
          Recent Activity
        </h3>
        <AuditTimeline logs={auditLogs} />
      </div>
    </div>
  );
}
