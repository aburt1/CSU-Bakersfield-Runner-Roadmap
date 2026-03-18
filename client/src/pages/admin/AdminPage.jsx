import { useState, useEffect } from 'react';
import { useAdminApi } from './hooks/useAdminApi';
import AdminLogin from './AdminLogin';
import StudentsTab from './StudentsTab';
import StepsTab from './StepsTab';
import AuditLogTab from './AuditLogTab';
import AdminUsersTab from './AdminUsersTab';
import TermsTab from './TermsTab';
import AnalyticsTab from './AnalyticsTab';
import { ROLES } from './roleConfig';

const TAB_ICONS = {
  students: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  steps: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  analytics: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  audit: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  terms: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
};


export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem('csub_admin_token'));
  const [adminUser, setAdminUser] = useState(() => {
    const stored = sessionStorage.getItem('csub_admin_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [activeTab, setActiveTab] = useState('students');
  const [steps, setSteps] = useState([]);
  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState(null);
  const api = useAdminApi(token);

  const handleLogin = (newToken, user) => {
    sessionStorage.setItem('csub_admin_token', newToken);
    sessionStorage.setItem('csub_admin_user', JSON.stringify(user));
    setToken(newToken);
    setAdminUser(user);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('csub_admin_token');
    sessionStorage.removeItem('csub_admin_user');
    setToken(null);
    setAdminUser(null);
  };

  // Fetch terms on login
  useEffect(() => {
    if (!token) return;
    api.get('/terms').then((data) => {
      setTerms(data);
      // Default to the active term
      const active = data.find((t) => t.is_active);
      if (active) setSelectedTermId(active.id);
    }).catch(() => {});
  }, [token, api]);

  // Fetch steps when term changes
  useEffect(() => {
    if (!token || !selectedTermId) return;
    api.get(`/steps?term_id=${selectedTermId}`).then(setSteps).catch(() => {});
  }, [token, api, selectedTermId]);

  if (!token) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const role = adminUser?.role || 'viewer';

  const tabs = [
    { key: 'students', label: 'Students' },
    { key: 'steps', label: 'Steps' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'audit', label: 'Audit Log' },
    ...(['admissions_editor', 'sysadmin'].includes(role) ? [{ key: 'terms', label: 'Terms' }] : []),
    ...(role === 'sysadmin' ? [{ key: 'users', label: 'Users' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-csub-blue-dark text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold uppercase tracking-wide">
              CSUB Admissions Admin
            </h1>
            <p className="font-body text-sm text-white/50 mt-0.5">
              Manage steps, student progress, and audit history
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Term selector */}
            {terms.length > 0 && (
              <select
                value={selectedTermId || ''}
                onChange={(e) => setSelectedTermId(parseInt(e.target.value, 10))}
                className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-gold"
              >
                {terms.map((t) => (
                  <option key={t.id} value={t.id} className="text-gray-900">
                    {t.name}{t.is_active ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
            )}
            {adminUser && (
              <div className="text-right">
                <p className="font-body text-sm font-medium">{adminUser.displayName}</p>
                <span className="inline-block text-xs px-2 py-0.5 rounded-full font-body bg-white/15 text-white/80">
                  {ROLES[role]?.label || role}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="font-body text-sm text-white/60 hover:text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 py-1.5 overflow-x-auto" role="tablist" aria-label="Admin sections">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-csub-blue/10 text-csub-blue-dark'
                  : 'text-csub-gray hover:bg-gray-50 hover:text-csub-blue-dark'
              }`}
            >
              {TAB_ICONS[tab.key]}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'students' && <StudentsTab api={api} steps={steps} role={role} termId={selectedTermId} />}
        {activeTab === 'steps' && <StepsTab api={api} role={role} termId={selectedTermId} />}
        {activeTab === 'analytics' && <AnalyticsTab api={api} termId={selectedTermId} />}
        {activeTab === 'audit' && <AuditLogTab api={api} />}
        {activeTab === 'terms' && ['admissions_editor', 'sysadmin'].includes(role) && <TermsTab api={api} onTermsChange={(t) => setTerms(t)} />}
        {activeTab === 'users' && role === 'sysadmin' && <AdminUsersTab api={api} />}
      </div>
    </div>
  );
}
