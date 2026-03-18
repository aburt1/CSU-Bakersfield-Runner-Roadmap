import { useState, useCallback } from 'react';
import AuditTimeline from './AuditTimeline';

export default function AuditLogTab({ api }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [actionFilter, setActionFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const LIMIT = 30;

  const fetchLogs = useCallback(async (studentId, action, off = 0, append = false) => {
    setLoading(true);
    try {
      let path = `/audit?limit=${LIMIT}&offset=${off}`;
      if (studentId) path += `&studentId=${encodeURIComponent(studentId)}`;
      if (action) path += `&entityType=${encodeURIComponent(action)}`;

      const data = await api.get(path);
      setLogs((prev) => append ? [...prev, ...data.logs] : data.logs);
      setTotal(data.total);
      setOffset(off + LIMIT);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api]);

  const handleSearch = async () => {
    if (studentSearch.trim()) {
      try {
        const data = await api.get(`/students?search=${encodeURIComponent(studentSearch)}`);
        setStudentResults(data.students || []);
      } catch {
        setStudentResults([]);
      }
    } else {
      setSelectedStudentId('');
      setStudentResults([]);
      fetchLogs('', actionFilter, 0);
    }
  };

  const selectStudent = (student) => {
    setSelectedStudentId(student.id);
    setStudentSearch(student.display_name);
    setStudentResults([]);
    fetchLogs(student.id, actionFilter, 0);
  };

  const handleActionFilter = (value) => {
    setActionFilter(value);
    fetchLogs(selectedStudentId, value, 0);
  };

  const handleLoadMore = () => {
    fetchLogs(selectedStudentId, actionFilter, offset, true);
  };

  const handleApplyFilters = () => {
    fetchLogs(selectedStudentId, actionFilter, 0);
  };

  return (
    <div>
      <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide mb-4">
        Audit Log
      </h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <div className="flex gap-2">
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Filter by student name..."
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg shadow transition-colors text-sm"
            >
              Search
            </button>
          </div>
          {studentResults.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {studentResults.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectStudent(s)}
                  className="w-full text-left px-4 py-2 hover:bg-csub-blue/5 transition-colors"
                >
                  <p className="font-body text-sm font-semibold text-csub-blue-dark">{s.display_name}</p>
                  <p className="font-body text-xs text-csub-gray">{s.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          value={actionFilter}
          onChange={(e) => handleActionFilter(e.target.value)}
          className="px-4 py-2.5 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent bg-white"
        >
          <option value="">All types</option>
          <option value="student_progress">Progress changes</option>
          <option value="student_tags">Tag changes</option>
          <option value="step">Step management</option>
        </select>

        {selectedStudentId && (
          <button
            onClick={() => {
              setSelectedStudentId('');
              setStudentSearch('');
              fetchLogs('', actionFilter, 0);
            }}
            className="font-body text-xs text-red-500 hover:text-red-700 px-3 py-2.5 transition-colors"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Initial state */}
      {logs.length === 0 && !loading && offset === 0 && (
        <div className="text-center py-8">
          <p className="font-body text-sm text-csub-gray mb-2">
            {selectedStudentId ? 'No audit entries for this student.' : 'Search or apply filters to view audit history.'}
          </p>
          {!selectedStudentId && (
            <button
              onClick={handleApplyFilters}
              className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg shadow transition-colors text-sm"
            >
              Load All
            </button>
          )}
        </div>
      )}

      <AuditTimeline logs={logs} />

      {/* Load more */}
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
