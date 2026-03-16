import { useState, useCallback } from 'react';
import { STEPS } from '../data/steps';

const API_BASE = '/api/admin';

function AdminLogin({ onLogin }) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/students?search=__test__`, {
        headers: { 'X-Api-Key': apiKey },
      });
      if (res.ok) {
        onLogin(apiKey);
      } else if (res.status === 403 || res.status === 401) {
        setError('Invalid API key.');
      } else {
        setError('Server error. Try again.');
      }
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-sm w-full mx-auto px-6">
        <h1 className="font-display text-2xl font-bold text-csub-blue-dark uppercase tracking-wide mb-2 text-center">
          Admin Portal
        </h1>
        <p className="font-body text-csub-gray text-sm mb-6 text-center">
          Enter your admin API key to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            required
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
          />
          {error && <p className="text-red-600 text-sm font-body">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-3 rounded-lg shadow transition-colors duration-200 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function StepToggle({ studentId, stepId, stepTitle, stepIcon, completed, apiKey, onToggle }) {
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      const method = completed ? 'DELETE' : 'POST';
      const res = await fetch(`${API_BASE}/students/${studentId}/steps/${stepId}/complete`, {
        method,
        headers: { 'X-Api-Key': apiKey },
      });
      if (res.ok) {
        onToggle(stepId, !completed);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border text-left transition-all duration-150 disabled:opacity-50 ${
        completed
          ? 'border-csub-gold bg-csub-gold-light/30'
          : 'border-gray-200 bg-white hover:border-csub-blue/30'
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          completed
            ? 'bg-csub-gold border-csub-gold text-csub-blue-dark'
            : 'border-gray-300 text-transparent'
        }`}
      >
        {completed ? '✓' : ''}
      </div>
      <span className="text-base" aria-hidden="true">{stepIcon}</span>
      <span className={`font-body text-sm ${completed ? 'text-csub-blue-dark font-semibold' : 'text-csub-gray'}`}>
        {stepTitle}
      </span>
    </button>
  );
}

function StudentRow({ student, isSelected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(student)}
      className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-150 ${
        isSelected
          ? 'border-csub-blue bg-csub-blue/5 shadow-sm'
          : 'border-gray-200 bg-white hover:border-csub-blue/30'
      }`}
    >
      <p className="font-body text-sm font-semibold text-csub-blue-dark">{student.display_name}</p>
      <p className="font-body text-xs text-csub-gray">{student.email}</p>
    </button>
  );
}

export default function AdminPage() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('csub_admin_key'));
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [progress, setProgress] = useState(new Set());
  const [searchLoading, setSearchLoading] = useState(false);

  const handleLogin = (key) => {
    sessionStorage.setItem('csub_admin_key', key);
    setApiKey(key);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('csub_admin_key');
    setApiKey(null);
    setStudents([]);
    setSelectedStudent(null);
  };

  const searchStudents = useCallback(async (query) => {
    if (!query.trim()) {
      setStudents([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`${API_BASE}/students?search=${encodeURIComponent(query)}`, {
        headers: { 'X-Api-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data);
      } else if (res.status === 401 || res.status === 403) {
        handleLogout();
      }
    } catch {
      // ignore
    } finally {
      setSearchLoading(false);
    }
  }, [apiKey]);

  const selectStudent = useCallback(async (student) => {
    setSelectedStudent(student);
    try {
      const res = await fetch(`${API_BASE}/students/${student.id}/progress`, {
        headers: { 'X-Api-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        setProgress(new Set(data.progress.map((p) => p.step_id)));
      }
    } catch {
      // ignore
    }
  }, [apiKey]);

  const handleStepToggle = (stepId, completed) => {
    setProgress((prev) => {
      const next = new Set(prev);
      if (completed) {
        next.add(stepId);
      } else {
        next.delete(stepId);
      }
      return next;
    });
  };

  if (!apiKey) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-csub-blue-dark text-white px-6 py-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide">
          CSUB Admissions Admin
        </h1>
        <button
          onClick={handleLogout}
          className="font-body text-sm text-white/70 hover:text-white transition-colors"
        >
          Sign Out
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left: Search + Student list */}
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
              {students.map((s) => (
                <StudentRow
                  key={s.id}
                  student={s}
                  isSelected={selectedStudent?.id === s.id}
                  onSelect={selectStudent}
                />
              ))}
            </div>
          </div>

          {/* Right: Step manager */}
          <div>
            {selectedStudent ? (
              <>
                <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide mb-1">
                  {selectedStudent.display_name}
                </h2>
                <p className="font-body text-sm text-csub-gray mb-4">{selectedStudent.email}</p>
                <p className="font-body text-xs text-csub-blue font-semibold mb-3">
                  {progress.size} of {STEPS.length} steps completed
                </p>
                <div className="space-y-2">
                  {STEPS.map((step) => (
                    <StepToggle
                      key={step.id}
                      studentId={selectedStudent.id}
                      stepId={step.id}
                      stepTitle={step.title}
                      stepIcon={step.icon}
                      completed={progress.has(step.id)}
                      apiKey={apiKey}
                      onToggle={handleStepToggle}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="font-body text-sm text-csub-gray">
                  Select a student to manage their steps.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
