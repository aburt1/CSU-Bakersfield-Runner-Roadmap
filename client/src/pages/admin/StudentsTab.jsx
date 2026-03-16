import { useState, useCallback, useEffect } from 'react';
import SummaryStats from './SummaryStats';
import StudentDetail from './StudentDetail';

export default function StudentsTab({ api, steps }) {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [totalActiveSteps, setTotalActiveSteps] = useState(0);

  useEffect(() => {
    setTotalActiveSteps(steps.filter((s) => s.is_active !== 0).length);
  }, [steps]);

  const searchStudents = useCallback(async (query) => {
    if (!query.trim()) {
      setStudents([]);
      return;
    }
    setSearchLoading(true);
    try {
      const data = await api.get(`/students?search=${encodeURIComponent(query)}`);
      setStudents(data);
    } catch {
      // ignore
    } finally {
      setSearchLoading(false);
    }
  }, [api]);

  const refreshSearch = () => {
    if (search.trim()) searchStudents(search);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <div>
      <SummaryStats api={api} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Search */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
              Find Student
            </h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Search input with icon */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchStudents(search)}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-20 py-3 rounded-xl border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
            <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center">
              <button
                onClick={() => searchStudents(search)}
                disabled={searchLoading}
                className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-4 py-1.5 rounded-lg shadow transition-colors text-xs disabled:opacity-50"
              >
                {searchLoading ? '...' : 'Search'}
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {students.length === 0 && search && !searchLoading && (
              <p className="font-body text-sm text-csub-gray text-center py-4">No students found.</p>
            )}
            {students.map((s) => {
              const pct = totalActiveSteps > 0 ? Math.round((s.completed_steps / totalActiveSteps) * 100) : 0;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 group ${
                    selectedStudent?.id === s.id
                      ? 'border-csub-blue bg-csub-blue/5 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-csub-blue/30 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-csub-blue/10 flex items-center justify-center text-csub-blue font-display text-xs font-bold flex-shrink-0">
                      {getInitials(s.display_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm font-semibold text-csub-blue-dark">{s.display_name}</p>
                      <p className="font-body text-xs text-csub-gray">{s.email}</p>
                    </div>
                    <span className="font-body text-xs text-csub-gray flex-shrink-0">
                      {s.completed_steps}/{totalActiveSteps}
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        background: pct === 100
                          ? 'linear-gradient(90deg, #003594, #FFC72C)'
                          : 'linear-gradient(90deg, #003594, #0052CC)',
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Student detail */}
        <div>
          <StudentDetail
            student={selectedStudent}
            steps={steps}
            api={api}
            onProgressChange={refreshSearch}
          />
        </div>
      </div>
    </div>
  );
}
