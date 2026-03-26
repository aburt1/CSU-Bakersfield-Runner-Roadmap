import { useState, useCallback, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import SummaryStats from './SummaryStats';
import StudentDetail from './StudentDetail';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface Step {
  id: number;
  title: string;
  icon: string | null;
  is_active: number;
  is_optional: number;
}

interface StudentListItem {
  id: number;
  display_name: string;
  email: string;
  emplid?: string;
  applicant_type?: string;
  residency?: string;
  completed_steps: number;
  overdue_step_count: number;
}

interface SortOption {
  value: string;
  label: string;
}

interface Props {
  api: AdminApi;
  steps: Step[];
  role?: string;
  termId: number | null;
}

const PER_PAGE = 25;

const SORT_OPTIONS: SortOption[] = [
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'name_asc', label: 'Name A\u2013Z' },
  { value: 'name_desc', label: 'Name Z\u2013A' },
  { value: 'progress_desc', label: 'Most Progress' },
  { value: 'progress_asc', label: 'Least Progress' },
];

export default function StudentsTab({ api, steps, role = 'viewer', termId }: Props) {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalActiveSteps, setTotalActiveSteps] = useState(0);

  const [page, setPage] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);
  const [sortBy, setSortBy] = useState('date_desc');
  const [overdueOnly, setOverdueOnly] = useState(false);

  useEffect(() => {
    setTotalActiveSteps(steps.filter((s) => s.is_active !== 0).length);
  }, [steps]);

  const fetchStudents = useCallback(async (overrides: Record<string, any> = {}) => {
    setLoading(true);
    try {
      const p = overrides.page ?? page;
      const s = overrides.sort ?? sortBy;
      const q = overrides.search ?? search;
      const od = overrides.overdueOnly ?? overdueOnly;

      let url = `/students?page=${p}&per_page=${PER_PAGE}&sort=${s}`;
      if (q.trim()) url += `&search=${encodeURIComponent(q)}`;
      if (termId) url += `&term_id=${termId}`;
      if (od) url += `&overdue_only=1`;

      const data = await api.get(url);
      setStudents(data.students);
      setTotalStudents(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api, page, sortBy, search, overdueOnly, termId]);

  useEffect(() => {
    fetchStudents();
  }, [page, sortBy, overdueOnly, termId]);

  const handleSearch = () => { setPage(1); fetchStudents({ page: 1 }); };
  const handleSearchClear = () => { setSearch(''); setPage(1); fetchStudents({ page: 1, search: '' }); };
  const handleSortChange = (newSort: string) => { setSortBy(newSort); setPage(1); fetchStudents({ page: 1, sort: newSort }); };
  const handleOverdueToggle = () => { const next = !overdueOnly; setOverdueOnly(next); setPage(1); fetchStudents({ page: 1, overdueOnly: next }); };
  const refreshStudents = () => fetchStudents();

  const getInitials = (name: string | undefined): string => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const totalPages = Math.ceil(totalStudents / PER_PAGE);
  const rangeStart = (page - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(page * PER_PAGE, totalStudents);

  return (
    <div>
      <SummaryStats api={api} termId={termId} />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6">
        {/* Left: Student list */}
        <div>
          <div className="mb-4">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">Students</h2>
              {totalStudents > 0 && <span className="font-body text-xs text-csub-gray bg-gray-100 rounded-full px-2.5 py-0.5">{totalStudents} total</span>}
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <p className="font-body text-xs text-csub-gray mt-1">Select a student to view their progress and manage step completions</p>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text" value={search} onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-24 py-2.5 rounded-xl border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
            <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center gap-1">
              {search && (
                <button onClick={handleSearchClear} className="text-gray-400 hover:text-gray-600 p-1 transition-colors" title="Clear search">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button onClick={handleSearch} disabled={loading} className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg shadow transition-colors text-xs disabled:opacity-50">
                {loading ? '...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3">
            <select value={sortBy} onChange={(e: ChangeEvent<HTMLSelectElement>) => handleSortChange(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-300 font-body text-xs focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent bg-white">
              {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <button onClick={handleOverdueToggle} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-body text-xs font-medium transition-all ${overdueOnly ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-csub-gray hover:border-red-200 hover:text-red-600'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Overdue
            </button>
          </div>

          {/* Student list */}
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {!loading && students.length === 0 && <p className="font-body text-sm text-csub-gray text-center py-6">{search ? 'No students found.' : 'No students in this term yet.'}</p>}
            {loading && students.length === 0 && <p className="font-body text-sm text-csub-gray text-center py-6">Loading students...</p>}
            {students.map((s) => {
              const pct = totalActiveSteps > 0 ? Math.round((s.completed_steps / totalActiveSteps) * 100) : 0;
              return (
                <button key={s.id} onClick={() => setSelectedStudent(s)} className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 group ${selectedStudent?.id === s.id ? 'border-csub-blue bg-csub-blue/5 shadow-sm' : 'border-gray-200 bg-white hover:border-csub-blue/30 hover:shadow-sm'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-csub-blue/10 flex items-center justify-center text-csub-blue font-display text-xs font-bold flex-shrink-0">{getInitials(s.display_name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm font-semibold text-csub-blue-dark">{s.display_name}</p>
                      <p className="font-body text-xs text-csub-gray">
                        {s.email}
                        {s.emplid ? <span className="ml-2">&middot; Student ID # {s.emplid}</span> : null}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.applicant_type && <span className="text-[10px] bg-gray-100 text-csub-blue-dark px-1.5 py-0.5 rounded-full font-body">{s.applicant_type}</span>}
                        {s.residency && <span className="text-[10px] bg-gray-100 text-csub-blue-dark px-1.5 py-0.5 rounded-full font-body">{s.residency}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.overdue_step_count > 0 && <span className="inline-flex items-center text-[10px] font-body font-semibold text-red-600 bg-red-50 rounded-full px-1.5 py-0.5">{s.overdue_step_count} overdue</span>}
                      <span className="font-body text-xs text-csub-gray">{s.completed_steps}/{totalActiveSteps}</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: pct === 100 ? 'linear-gradient(90deg, #003594, #FFC72C)' : 'linear-gradient(90deg, #003594, #0052CC)' }} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pagination */}
          {totalStudents > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 font-body text-xs font-semibold text-csub-blue hover:text-csub-blue-dark disabled:text-gray-300 disabled:cursor-not-allowed transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Prev
              </button>
              <span className="font-body text-xs text-csub-gray">{totalStudents > 0 ? `${rangeStart}\u2013${rangeEnd} of ${totalStudents}` : '0 results'}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="flex items-center gap-1 font-body text-xs font-semibold text-csub-blue hover:text-csub-blue-dark disabled:text-gray-300 disabled:cursor-not-allowed transition-colors">
                Next
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </div>

        {/* Right: Student detail */}
        <div className="md:sticky md:top-4 md:self-start">
          <StudentDetail student={selectedStudent} steps={steps} api={api} role={role} onProgressChange={refreshStudents} />
        </div>
      </div>
    </div>
  );
}
