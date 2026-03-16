import { useState, useEffect } from 'react';
import TagEditor from './TagEditor';
import StepToggle from './StepToggle';
import AuditTimeline from './AuditTimeline';

export default function StudentDetail({ student, steps, api, onProgressChange }) {
  const [progress, setProgress] = useState(new Map()); // stepId -> { completed_at, status, note }
  const [studentTags, setStudentTags] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [createdAt, setCreatedAt] = useState(null);

  useEffect(() => {
    if (!student) return;

    api.get(`/students/${student.id}/progress`).then((data) => {
      const map = new Map();
      for (const p of data.progress) {
        map.set(p.step_id, {
          completed_at: p.completed_at,
          status: p.status || 'completed',
          note: p.note || null,
        });
      }
      setProgress(map);
      setStudentTags(data.student?.tags ? JSON.parse(data.student.tags) : []);
      setCreatedAt(data.student?.created_at || null);
    }).catch(() => {});

    api.get(`/audit?studentId=${student.id}&limit=20`).then((data) => {
      setAuditLogs(data.logs);
    }).catch(() => {});
  }, [student, api]);

  const handleStepToggle = (stepId, newStatus) => {
    setProgress((prev) => {
      const next = new Map(prev);
      if (newStatus === null) {
        next.delete(stepId);
      } else {
        next.set(stepId, {
          completed_at: new Date().toISOString(),
          status: newStatus,
          note: null,
        });
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

  const doneCount = Array.from(progress.values()).filter(
    (p) => p.status === 'completed' || p.status === 'waived'
  ).length;
  const totalCount = steps.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-csub-blue flex items-center justify-center text-white font-display font-bold text-lg flex-shrink-0">
            {student.display_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
              {student.display_name}
            </h2>
            <p className="font-body text-sm text-csub-gray">{student.email}</p>
            {createdAt && (
              <p className="font-body text-xs text-csub-gray mt-0.5">
                Registered {new Date(createdAt + 'Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="mb-5">
        <label className="font-body text-xs font-semibold text-csub-blue-dark block mb-1">Student Tags</label>
        <TagEditor tags={studentTags} onChange={saveTags} />
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-body text-xs text-csub-blue-dark font-semibold">
            {doneCount} of {totalCount} steps done
          </span>
          <span className="font-display text-sm font-bold text-csub-blue">{pct}%</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: pct === 100
                ? 'linear-gradient(90deg, #003594, #FFC72C)'
                : 'linear-gradient(90deg, #003594, #0052CC)',
            }}
          />
        </div>
      </div>

      {/* Steps checklist */}
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">
          Steps
        </h3>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <div className="space-y-2 mb-6">
        {steps.map((step) => {
          const prog = progress.get(step.id);
          return (
            <StepToggle
              key={step.id}
              studentId={student.id}
              stepId={step.id}
              stepTitle={step.title}
              stepIcon={step.icon || '📋'}
              status={prog?.status || null}
              completedAt={prog?.completed_at || null}
              note={prog?.note || null}
              api={api}
              onToggle={handleStepToggle}
            />
          );
        })}
      </div>

      {/* Audit history */}
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">
          Recent Activity
        </h3>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <AuditTimeline logs={auditLogs} />
    </div>
  );
}
