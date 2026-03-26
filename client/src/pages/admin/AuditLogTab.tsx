import { useEffect, useState, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import AuditTimeline from './AuditTimeline';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface Props {
  api: AdminApi;
}

interface AuditLog {
  id: number;
  entity_type: string;
  action: string;
  changed_by: string;
  created_at: string;
  details: string | Record<string, any>;
}

interface StudentResult {
  id: number;
  display_name: string;
  email: string;
}

interface FilterOption {
  value: string;
  label: string;
}

const LIMIT = 30;

const ENTITY_OPTIONS: FilterOption[] = [
  { value: '', label: 'All entities' },
  { value: 'student_progress', label: 'Student progress' },
  { value: 'student_tags', label: 'Student tags' },
  { value: 'student_profile', label: 'Student profiles' },
  { value: 'step', label: 'Steps' },
  { value: 'term', label: 'Terms' },
  { value: 'admin_user', label: 'Admin users' },
];

const ACTION_OPTIONS: FilterOption[] = [
  { value: '', label: 'All actions' },
  { value: 'complete', label: 'Completed' },
  { value: 'waive', label: 'Waived' },
  { value: 'uncomplete', label: 'Marked incomplete' },
  { value: 'tags_update', label: 'Tags updated' },
  { value: 'step_create', label: 'Step created' },
  { value: 'step_update', label: 'Step updated' },
  { value: 'step_delete', label: 'Step deactivated' },
  { value: 'step_restore', label: 'Step restored' },
  { value: 'term_create', label: 'Term created' },
  { value: 'term_update', label: 'Term updated' },
  { value: 'term_delete', label: 'Term deleted' },
  { value: 'admin_create', label: 'Admin created' },
  { value: 'admin_update', label: 'Admin updated' },
];

interface FetchFilters {
  studentId?: string;
  entityType?: string;
  action?: string;
  changedBy?: string;
  q?: string;
}

export default function AuditLogTab({ api }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);

  const fetchLogs = useCallback(async (filters: FetchFilters = {}, off = 0, append = false) => {
    setLoading(true);
    try {
      const studentId = filters.studentId ?? selectedStudentId;
      const entityType = filters.entityType ?? entityFilter;
      const action = filters.action ?? actionFilter;
      const changedBy = filters.changedBy ?? actorFilter;
      const q = filters.q ?? query;

      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(off),
      });
      if (studentId) params.set('studentId', studentId);
      if (entityType) params.set('entityType', entityType);
      if (action) params.set('action', action);
      if (changedBy.trim()) params.set('changedBy', changedBy.trim());
      if (q.trim()) params.set('q', q.trim());

      const data = await api.get(`/audit?${params.toString()}`);
      setLogs((prev) => (append ? [...prev, ...data.logs] : data.logs));
      setTotal(data.total);
      setOffset(off + LIMIT);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api, selectedStudentId, entityFilter, actionFilter, actorFilter, query]);

  useEffect(() => {
    fetchLogs({}, 0);
  }, [fetchLogs]);

  const handleStudentSearch = async () => {
    if (!studentSearch.trim()) {
      setSelectedStudentId('');
      setStudentResults([]);
      return fetchLogs({ studentId: '' }, 0);
    }

    try {
      const data = await api.get(`/students?search=${encodeURIComponent(studentSearch)}`);
      setStudentResults(data.students || []);
    } catch {
      setStudentResults([]);
    }
  };

  const selectStudent = (student: StudentResult) => {
    setSelectedStudentId(String(student.id));
    setStudentSearch(student.display_name);
    setStudentResults([]);
    fetchLogs({ studentId: String(student.id) }, 0);
  };

  const clearStudent = () => {
    setSelectedStudentId('');
    setStudentSearch('');
    setStudentResults([]);
    fetchLogs({ studentId: '' }, 0);
  };

  const handleApplyFilters = () => {
    fetchLogs({}, 0);
  };

  const handleLoadMore = () => {
    fetchLogs({}, offset, true);
  };

  const stats = {
    shown: logs.length,
    total,
    filtered: Boolean(selectedStudentId || entityFilter || actionFilter || actorFilter.trim() || query.trim()),
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
            Audit Log
          </h2>
          <p className="font-body text-sm text-csub-gray mt-1">
            Track who changed what, when it happened, and what was affected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-body text-xs text-csub-gray bg-gray-100 rounded-full px-2.5 py-1">
            {stats.shown} shown
          </span>
          <span className="font-body text-xs text-csub-gray bg-gray-100 rounded-full px-2.5 py-1">
            {stats.total} total
          </span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="relative">
            <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Student</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={studentSearch}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setStudentSearch(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleStudentSearch()}
                placeholder="Search by student name or email..."
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
              />
              <button
                onClick={handleStudentSearch}
                className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg shadow transition-colors text-sm"
              >
                Search
              </button>
            </div>

            {studentResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {studentResults.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => selectStudent(student)}
                    className="w-full text-left px-4 py-2 hover:bg-csub-blue/5 transition-colors"
                  >
                    <p className="font-body text-sm font-semibold text-csub-blue-dark">{student.display_name}</p>
                    <p className="font-body text-xs text-csub-gray">{student.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Search audit content</label>
            <input
              type="text"
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleApplyFilters()}
              placeholder="Search notes, titles, actors, and details..."
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Entity</label>
            <select
              value={entityFilter}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                setEntityFilter(e.target.value);
                fetchLogs({ entityType: e.target.value }, 0);
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent bg-white"
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                setActionFilter(e.target.value);
                fetchLogs({ action: e.target.value }, 0);
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent bg-white"
            >
              {ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-body text-xs font-semibold text-csub-blue-dark mb-1">Changed by</label>
            <input
              type="text"
              value={actorFilter}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setActorFilter(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleApplyFilters()}
              placeholder="Admin name or email..."
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(query.trim() || actorFilter.trim()) && (
            <button
              onClick={handleApplyFilters}
              className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg shadow transition-colors text-sm"
            >
              Apply
            </button>
          )}
          {selectedStudentId && (
            <button
              onClick={clearStudent}
              className="font-body text-sm text-red-600 hover:text-red-800 transition-colors"
            >
              Clear student
            </button>
          )}
          {stats.filtered && (
            <button
              onClick={() => {
                setSelectedStudentId('');
                setStudentSearch('');
                setStudentResults([]);
                setEntityFilter('');
                setActionFilter('');
                setActorFilter('');
                setQuery('');
                fetchLogs({ studentId: '', entityType: '', action: '', changedBy: '', q: '' }, 0);
              }}
              className="font-body text-sm text-csub-gray hover:text-csub-blue-dark transition-colors"
            >
              Reset all
            </button>
          )}
        </div>
      </div>

      {logs.length === 0 && !loading ? (
        <div className="text-center py-10">
          <p className="font-body text-sm text-csub-gray">
            No audit entries match the current filters.
          </p>
        </div>
      ) : (
        <AuditTimeline logs={logs} />
      )}

      {logs.length < total && (
        <div className="text-center mt-4">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="font-body text-sm text-csub-blue hover:text-csub-blue-dark font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : `Load more (${logs.length} of ${total})`}
          </button>
        </div>
      )}
    </div>
  );
}
