import { useState, useCallback, useEffect } from 'react';

const API_BASE = '/api/admin';

// ─── Admin Login ─────────────────────────────────────────

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

// ─── Step Toggle (for student progress) ──────────────────

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
      if (res.ok) onToggle(stepId, !completed);
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

// ─── Tag Editor ──────────────────────────────────────────

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  };

  const removeTag = (tag) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-csub-blue/10 text-csub-blue-dark text-xs font-body font-semibold px-2 py-1 rounded-full"
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-red-600 ml-0.5">&times;</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          placeholder="Add tag..."
          className="flex-1 px-3 py-1.5 rounded border border-gray-300 font-body text-xs focus:outline-none focus:ring-1 focus:ring-csub-blue"
        />
        <button
          type="button"
          onClick={addTag}
          className="bg-csub-blue text-white font-body text-xs px-3 py-1.5 rounded hover:bg-csub-blue-dark transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Students Tab ────────────────────────────────────────

function StudentsTab({ apiKey, steps }) {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [progress, setProgress] = useState(new Set());
  const [studentTags, setStudentTags] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

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
      if (res.ok) setStudents(await res.json());
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
        setStudentTags(data.student?.tags ? JSON.parse(data.student.tags) : []);
      }
    } catch {
      // ignore
    }
  }, [apiKey]);

  const handleStepToggle = (stepId, completed) => {
    setProgress((prev) => {
      const next = new Set(prev);
      completed ? next.add(stepId) : next.delete(stepId);
      return next;
    });
  };

  const saveTags = async (newTags) => {
    setStudentTags(newTags);
    try {
      await fetch(`${API_BASE}/students/${selectedStudent.id}/tags`, {
        method: 'PUT',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      });
    } catch {
      // ignore
    }
  };

  return (
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
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => selectStudent(s)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-150 ${
                selectedStudent?.id === s.id
                  ? 'border-csub-blue bg-csub-blue/5 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-csub-blue/30'
              }`}
            >
              <p className="font-body text-sm font-semibold text-csub-blue-dark">{s.display_name}</p>
              <p className="font-body text-xs text-csub-gray">{s.email}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Student detail */}
      <div>
        {selectedStudent ? (
          <>
            <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide mb-1">
              {selectedStudent.display_name}
            </h2>
            <p className="font-body text-sm text-csub-gray mb-3">{selectedStudent.email}</p>

            <div className="mb-4">
              <label className="font-body text-xs font-semibold text-csub-blue-dark block mb-1">Student Tags</label>
              <TagEditor tags={studentTags} onChange={saveTags} />
            </div>

            <p className="font-body text-xs text-csub-blue font-semibold mb-3">
              {progress.size} of {steps.length} steps completed
            </p>
            <div className="space-y-2">
              {steps.map((step) => (
                <StepToggle
                  key={step.id}
                  studentId={selectedStudent.id}
                  stepId={step.id}
                  stepTitle={step.title}
                  stepIcon={step.icon || '📋'}
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
              Select a student to manage their progress and tags.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step Form ───────────────────────────────────────────

function StepForm({ step, onSave, onCancel }) {
  const [title, setTitle] = useState(step?.title || '');
  const [icon, setIcon] = useState(step?.icon || '');
  const [description, setDescription] = useState(step?.description || '');
  const [deadline, setDeadline] = useState(step?.deadline || '');
  const [guideContent, setGuideContent] = useState(step?.guide_content || '');
  const [linksText, setLinksText] = useState(
    step?.links ? (typeof step.links === 'string' ? step.links : JSON.stringify(step.links, null, 2)) : ''
  );
  const [requiredTags, setRequiredTags] = useState(
    step?.required_tags
      ? (typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags)
      : []
  );
  const [sortOrder, setSortOrder] = useState(step?.sort_order ?? '');

  const handleSubmit = (e) => {
    e.preventDefault();
    let parsedLinks = null;
    if (linksText.trim()) {
      try {
        parsedLinks = JSON.parse(linksText);
      } catch {
        alert('Links must be valid JSON: [{\"label\":\"...\",\"url\":\"...\"}]');
        return;
      }
    }

    onSave({
      title,
      icon: icon || null,
      description: description || null,
      deadline: deadline || null,
      guide_content: guideContent || null,
      links: parsedLinks,
      required_tags: requiredTags.length > 0 ? requiredTags : null,
      sort_order: sortOrder !== '' ? parseInt(sortOrder, 10) : undefined,
    });
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-1 focus:ring-csub-blue';
  const label = 'block font-body text-xs font-semibold text-csub-blue-dark mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Title *</label>
          <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Icon (emoji)</label>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className={field} placeholder="📋" />
        </div>
      </div>

      <div>
        <label className={label}>Short Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Deadline</label>
          <input type="text" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={field} placeholder="e.g. May 1, 2026" />
        </div>
        <div>
          <label className={label}>Sort Order</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Guide Content (detailed instructions)</label>
        <textarea
          value={guideContent}
          onChange={(e) => setGuideContent(e.target.value)}
          rows={4}
          className={field}
          placeholder="Detailed instructions for completing this step..."
        />
      </div>

      <div>
        <label className={label}>Links (JSON array)</label>
        <textarea
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
          rows={3}
          className={`${field} font-mono text-xs`}
          placeholder='[{"label":"Apply Here","url":"https://..."}]'
        />
      </div>

      <div>
        <label className={label}>Required Tags (only show to students with these tags)</label>
        <TagEditor tags={requiredTags} onChange={setRequiredTags} />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-2.5 rounded-lg shadow transition-colors text-sm"
        >
          {step ? 'Save Changes' : 'Create Step'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-gray-300 text-csub-gray hover:text-csub-blue-dark font-body px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Steps Tab ───────────────────────────────────────────

function StepsTab({ apiKey }) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingStep, setEditingStep] = useState(null); // null = closed, {} = new, {id,...} = editing
  const [showInactive, setShowInactive] = useState(false);

  const fetchSteps = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/steps`, {
        headers: { 'X-Api-Key': apiKey },
      });
      if (res.ok) setSteps(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  const handleSave = async (data) => {
    try {
      if (editingStep?.id) {
        // Update
        await fetch(`${API_BASE}/steps/${editingStep.id}`, {
          method: 'PUT',
          headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } else {
        // Create
        await fetch(`${API_BASE}/steps`, {
          method: 'POST',
          headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      }
      setEditingStep(null);
      fetchSteps();
    } catch {
      alert('Failed to save step.');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this step? Students will no longer see it.')) return;
    try {
      await fetch(`${API_BASE}/steps/${id}`, {
        method: 'DELETE',
        headers: { 'X-Api-Key': apiKey },
      });
      fetchSteps();
    } catch {
      // ignore
    }
  };

  const handleRestore = async (id) => {
    try {
      await fetch(`${API_BASE}/steps/${id}`, {
        method: 'PUT',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: 1 }),
      });
      fetchSteps();
    } catch {
      // ignore
    }
  };

  const moveStep = async (index, direction) => {
    const sorted = [...steps].sort((a, b) => a.sort_order - b.sort_order);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const order = sorted.map((s, i) => ({ id: s.id, sort_order: s.sort_order }));
    const tempOrder = order[index].sort_order;
    order[index].sort_order = order[swapIndex].sort_order;
    order[swapIndex].sort_order = tempOrder;

    try {
      await fetch(`${API_BASE}/steps/reorder`, {
        method: 'PUT',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      fetchSteps();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return <p className="font-body text-sm text-csub-gray text-center py-8">Loading steps...</p>;
  }

  const sortedSteps = [...steps].sort((a, b) => a.sort_order - b.sort_order);
  const visibleSteps = showInactive ? sortedSteps : sortedSteps.filter((s) => s.is_active !== 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
          Manage Steps
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 font-body text-xs text-csub-gray cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Show inactive
          </label>
          <button
            onClick={() => setEditingStep({})}
            className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-4 py-2 rounded-lg shadow transition-colors text-sm"
          >
            + New Step
          </button>
        </div>
      </div>

      {editingStep && !editingStep.id && (
        <div className="mb-6">
          <StepForm step={null} onSave={handleSave} onCancel={() => setEditingStep(null)} />
        </div>
      )}

      <div className="space-y-2">
        {visibleSteps.map((step, i) => (
          <div key={step.id}>
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                step.is_active === 0
                  ? 'border-gray-200 bg-gray-50 opacity-60'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  className="text-xs text-csub-gray hover:text-csub-blue disabled:opacity-30"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveStep(i, 1)}
                  disabled={i === visibleSteps.length - 1}
                  className="text-xs text-csub-gray hover:text-csub-blue disabled:opacity-30"
                  title="Move down"
                >
                  ▼
                </button>
              </div>

              <span className="text-lg w-8 text-center flex-shrink-0">{step.icon || '📋'}</span>

              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-semibold text-csub-blue-dark truncate">{step.title}</p>
                <p className="font-body text-xs text-csub-gray truncate">
                  {step.description || 'No description'}
                  {step.deadline && ` — ${step.deadline}`}
                </p>
                {step.required_tags && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags).map((tag) => (
                      <span key={tag} className="text-[10px] bg-csub-blue/10 text-csub-blue-dark px-1.5 py-0.5 rounded-full font-body">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setEditingStep(step)}
                  className="font-body text-xs text-csub-blue hover:text-csub-blue-dark transition-colors"
                >
                  Edit
                </button>
                {step.is_active === 0 ? (
                  <button
                    onClick={() => handleRestore(step.id)}
                    className="font-body text-xs text-green-600 hover:text-green-800 transition-colors"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    onClick={() => handleDelete(step.id)}
                    className="font-body text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {editingStep?.id === step.id && (
              <div className="mt-2 mb-4">
                <StepForm step={step} onSave={handleSave} onCancel={() => setEditingStep(null)} />
              </div>
            )}
          </div>
        ))}
      </div>

      {visibleSteps.length === 0 && (
        <p className="font-body text-sm text-csub-gray text-center py-8">No steps yet. Create one above.</p>
      )}
    </div>
  );
}

// ─── Main Admin Page ─────────────────────────────────────

export default function AdminPage() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('csub_admin_key'));
  const [activeTab, setActiveTab] = useState('students');
  const [steps, setSteps] = useState([]);

  const handleLogin = (key) => {
    sessionStorage.setItem('csub_admin_key', key);
    setApiKey(key);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('csub_admin_key');
    setApiKey(null);
  };

  // Fetch steps for the Students tab (active only)
  useEffect(() => {
    if (!apiKey) return;
    fetch(`${API_BASE}/steps`, { headers: { 'X-Api-Key': apiKey } })
      .then((r) => r.ok ? r.json() : [])
      .then(setSteps)
      .catch(() => {});
  }, [apiKey]);

  if (!apiKey) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const tabs = [
    { key: 'students', label: 'Students' },
    { key: 'steps', label: 'Steps' },
  ];

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

      {/* Tab nav */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`font-display text-sm font-bold uppercase tracking-wider px-6 py-3 border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-csub-blue text-csub-blue-dark'
                  : 'border-transparent text-csub-gray hover:text-csub-blue-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {activeTab === 'students' && <StudentsTab apiKey={apiKey} steps={steps} />}
        {activeTab === 'steps' && <StepsTab apiKey={apiKey} />}
      </div>
    </div>
  );
}
