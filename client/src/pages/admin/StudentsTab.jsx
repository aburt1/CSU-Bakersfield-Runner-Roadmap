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

  return (
    <div>
      <SummaryStats api={api} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Search */}
        <div>
          <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide mb-4">
            Find Student
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchStudents(search)}
              placeholder="Search by name or email..."
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
            <button
              onClick={() => searchStudents(search)}
              disabled={searchLoading}
              className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-5 py-3 rounded-lg shadow transition-colors duration-200 text-sm disabled:opacity-50"
            >
              {searchLoading ? '...' : 'Search'}
            </button>
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
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-150 ${
                    selectedStudent?.id === s.id
                      ? 'border-csub-blue bg-csub-blue/5 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-csub-blue/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-body text-sm font-semibold text-csub-blue-dark">{s.display_name}</p>
                      <p className="font-body text-xs text-csub-gray">{s.email}</p>
                    </div>
                    <span className="font-body text-xs text-csub-gray flex-shrink-0 ml-2">
                      {s.completed_steps}/{totalActiveSteps}
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-csub-gold rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
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
