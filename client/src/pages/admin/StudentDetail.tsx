import { useState, useEffect } from 'react';
import TagEditor from './TagEditor';
import StepToggle from './StepToggle';
import AuditTimeline from './AuditTimeline';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface Student {
  id: number;
  display_name: string;
  email: string;
}

interface Step {
  id: number;
  title: string;
  icon: string | null;
  is_optional: number;
}

interface ProgressInfo {
  completed_at: string | null;
  status: string;
  note: string | null;
}

interface ProfileField {
  key: string;
  label: string;
}

interface Props {
  student: Student | null;
  steps: Step[];
  api: AdminApi;
  role?: string;
  onProgressChange?: () => void;
}

function parseTags(rawTags: unknown): string[] {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) return rawTags;
  try {
    return JSON.parse(rawTags as string);
  } catch {
    return [];
  }
}

const PROFILE_FIELDS: ProfileField[] = [
  { key: 'emplid', label: 'Student ID #' },
  { key: 'preferred_name', label: 'Preferred Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'applicant_type', label: 'Applicant Type' },
  { key: 'major', label: 'Major' },
  { key: 'residency', label: 'Residency' },
  { key: 'admit_term', label: 'Admit Term' },
];

function displayDate(value: string | null | undefined, withTime = false): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return withTime
    ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function StudentDetail({ student, steps, api, role = 'viewer', onProgressChange }: Props) {
  const canEdit = role === 'admissions' || role === 'admissions_editor' || role === 'sysadmin';
  const [progress, setProgress] = useState<Map<number, ProgressInfo>>(new Map());
  const [studentTags, setStudentTags] = useState<string[]>([]);
  const [derivedTags, setDerivedTags] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!student) return;

    api.get(`/students/${student.id}/progress`).then((data: any) => {
      const map = new Map<number, ProgressInfo>();
      for (const p of data.progress) {
        map.set(p.step_id, {
          completed_at: p.completed_at,
          status: p.status || 'completed',
          note: p.note || null,
        });
      }
      setProgress(map);
      setStudentTags(data.manualTags || parseTags(data.student?.tags));
      setDerivedTags(data.derivedTags || []);
      setStudentProfile(data.student || null);
    }).catch(() => {});

    api.get(`/audit?studentId=${student.id}&limit=20`).then((data: any) => {
      setAuditLogs(data.logs);
    }).catch(() => {});
  }, [student, api]);

  const refreshAudit = () => {
    api.get(`/audit?studentId=${student!.id}&limit=20`).then((data: any) => {
      setAuditLogs(data.logs);
    }).catch(() => {});
  };

  const handleStepToggle = (stepId: number, newStatus: string | null) => {
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
    refreshAudit();
  };

  const saveTags = async (newTags: string[]) => {
    setStudentTags(newTags);
    try {
      await api.put(`/students/${student!.id}/tags`, { tags: newTags });
      refreshAudit();
    } catch {
      // ignore
    }
  };

  if (!student) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="font-body text-sm text-csub-gray">
          Select a student to manage their progress, imported profile, and tags.
        </p>
      </div>
    );
  }

  const requiredSteps = steps.filter((step) => step.is_optional !== 1);
  const optionalSteps = steps.filter((step) => step.is_optional === 1);
  const doneCount = requiredSteps.filter((step) => {
    const value = progress.get(step.id);
    return value?.status === 'completed' || value?.status === 'waived';
  }).length;
  const optionalDoneCount = optionalSteps.filter((step) => {
    const value = progress.get(step.id);
    return value?.status === 'completed' || value?.status === 'waived';
  }).length;
  const totalCount = requiredSteps.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-csub-blue flex items-center justify-center text-white font-display font-bold text-lg flex-shrink-0">
            {student.display_name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
              {studentProfile?.preferred_name || student.display_name}
            </h2>
            <p className="font-body text-sm text-csub-gray">{student.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {studentProfile?.emplid && (
                <span className="text-[10px] bg-csub-blue/10 text-csub-blue-dark rounded-full px-2 py-0.5 font-body font-semibold">
                  Student ID # {studentProfile.emplid}
                </span>
              )}
              {studentProfile?.applicant_type && (
                <span className="text-[10px] bg-gray-100 text-csub-blue-dark rounded-full px-2 py-0.5 font-body font-semibold">{studentProfile.applicant_type}</span>
              )}
              {studentProfile?.residency && (
                <span className="text-[10px] bg-gray-100 text-csub-blue-dark rounded-full px-2 py-0.5 font-body font-semibold">{studentProfile.residency}</span>
              )}
            </div>
            {studentProfile?.created_at && (
              <p className="font-body text-xs text-csub-gray mt-1">Registered {displayDate(studentProfile.created_at)}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">Imported Profile</h3>
          </div>
          {studentProfile?.last_synced_at && (
            <span className="font-body text-[10px] text-csub-gray bg-gray-100 rounded-full px-2 py-1">Synced {displayDate(studentProfile.last_synced_at, true)}</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROFILE_FIELDS.map((f) => (
            <div key={f.key} className="bg-gray-50 rounded-lg px-3 py-3 border border-gray-200">
              <p className="font-body text-[10px] uppercase tracking-wide text-csub-gray">{f.label}</p>
              <p className="font-body text-sm text-csub-blue-dark mt-1 break-words">{studentProfile?.[f.key] || 'Not set'}</p>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <div className="mb-5">
          <label className="font-body text-xs font-semibold text-csub-blue-dark block mb-1">Manual Tags</label>
          <TagEditor tags={studentTags} onChange={saveTags} />
        </div>
      )}

      {derivedTags.length > 0 && (
        <div className="mb-5">
          <label className="font-body text-xs font-semibold text-csub-blue-dark block mb-2">Derived Tags</label>
          <div className="flex flex-wrap gap-1">
            {derivedTags.map((tag) => (
              <span key={tag} className="inline-flex items-center bg-amber-50 text-amber-800 text-xs font-body font-semibold px-2 py-1 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-body text-xs text-csub-blue-dark font-semibold">{doneCount} of {totalCount} required steps done</span>
          <span className="font-display text-sm font-bold text-csub-blue">{pct}%</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct === 100 ? 'linear-gradient(90deg, #003594, #FFC72C)' : 'linear-gradient(90deg, #003594, #0052CC)' }} />
        </div>
        {optionalSteps.length > 0 && (
          <p className="font-body text-xs text-csub-gray mt-2">Optional opportunities: <span className="font-semibold text-csub-blue-dark">{optionalDoneCount}</span> of {optionalSteps.length}</p>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">Steps</h3>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <div className="space-y-2 mb-6">
        {requiredSteps.map((step) => {
          const prog = progress.get(step.id);
          return (
            <StepToggle key={step.id} studentId={student.id} stepId={step.id} stepTitle={step.title} stepIcon={step.icon || '\uD83D\uDCCB'} status={prog?.status || null} completedAt={prog?.completed_at || null} note={prog?.note || null} api={api} onToggle={handleStepToggle} readOnly={!canEdit} isOptional={false} />
          );
        })}
      </div>

      {optionalSteps.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">Optional Opportunities</h3>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="space-y-2 mb-6">
            {optionalSteps.map((step) => {
              const prog = progress.get(step.id);
              return (
                <StepToggle key={step.id} studentId={student.id} stepId={step.id} stepTitle={step.title} stepIcon={step.icon || '\uD83D\uDCCB'} status={prog?.status || null} completedAt={prog?.completed_at || null} note={prog?.note || null} api={api} onToggle={handleStepToggle} readOnly={!canEdit} isOptional />
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">Recent Activity</h3>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <AuditTimeline logs={auditLogs} />
    </div>
  );
}
