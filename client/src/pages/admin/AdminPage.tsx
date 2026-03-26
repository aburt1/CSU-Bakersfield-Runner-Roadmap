import { useState, useEffect, type ReactNode, type ChangeEvent } from 'react';
import { isAzureAdConfigured } from '../../auth/msalConfig';
import { useAdminApi } from './hooks/useAdminApi';
import AdminLogin from './AdminLogin';
import StudentsTab from './StudentsTab';
import AuditLogTab from './AuditLogTab';
import AdminUsersTab from './AdminUsersTab';
import AnalyticsTab from './AnalyticsTab';
import TermStepsTab from './TermStepsTab';
import { ROLES } from './roleConfig';

interface AdminUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
}

interface Term {
  id: number;
  name: string;
  is_active: number;
  start_date: string;
  end_date: string;
  step_count?: number;
  student_count?: number;
}

interface Step {
  id: number;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: number;
  is_optional: number;
  is_public: number;
  icon: string | null;
  deadline: string | null;
  deadline_date: string | null;
  required_tags: string | string[] | null;
  excluded_tags: string | string[] | null;
  required_tag_mode: string | null;
  term_id: number;
}

interface TabDef {
  key: string;
  label: string;
}

const TAB_ICONS: Record<string, ReactNode> = {
  students: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  termSteps: (
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
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('csub_admin_token'));
  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
    const stored = sessionStorage.getItem('csub_admin_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [activeTab, setActiveTab] = useState('students');
  const [steps, setSteps] = useState<Step[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);
  const api = useAdminApi(token);

  const handleTermsChange = (nextTerms: Term[], preferredTermId: number | null = selectedTermId) => {
    setTerms(nextTerms);
    if (preferredTermId && nextTerms.some((term) => term.id === preferredTermId)) {
      setSelectedTermId(preferredTermId);
      return;
    }

    const active = nextTerms.find((term) => term.is_active);
    if (active) {
      setSelectedTermId(active.id);
      return;
    }

    setSelectedTermId(nextTerms[0]?.id || null);
  };

  const handleLogin = (newToken: string, user: AdminUser) => {
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
    api.get<Term[]>('/terms').then((data) => {
      handleTermsChange(data);
    }).catch(() => {});
  }, [token, api]);

  // Fetch steps when term changes
  useEffect(() => {
    if (!token || !selectedTermId) return;
    api.get<Step[]>(`/steps?term_id=${selectedTermId}`).then(setSteps).catch(() => {});
  }, [token, api, selectedTermId]);

  if (!token) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const role = adminUser?.role || 'viewer';
  const showHeaderTermSelector = ['students', 'termSteps', 'analytics'].includes(activeTab) && terms.length > 0;

  const tabs: TabDef[] = [
    { key: 'students', label: 'Students' },
    { key: 'termSteps', label: 'Terms & Steps' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'audit', label: 'Audit Log' },
    ...(role === 'sysadmin' ? [{ key: 'users', label: 'Users' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-csub-blue-dark text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          {/* Top row: title + user actions */}
          <div className="flex items-center justify-between">
            <h1 className="font-display text-lg font-bold uppercase tracking-wide">
              CSUB Admissions Admin
            </h1>
            <div className="flex items-center gap-3 text-sm font-body">
              {showHeaderTermSelector && (
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <span className="uppercase tracking-wider font-display font-bold text-[10px]">Term</span>
                  <select
                    value={selectedTermId || ''}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedTermId(parseInt(e.target.value, 10))}
                    className="bg-white/10 text-white border border-white/20 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-csub-gold"
                    aria-label="Selected term"
                  >
                    {terms.map((t) => (
                      <option key={t.id} value={t.id} className="text-gray-900">
                        {t.name}{t.is_active ? '' : ' (inactive)'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="text-white/70">
                {adminUser?.displayName}
                <span className="text-white/40 ml-1.5 text-xs">
                  {ROLES[role]?.label || role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="text-white/50 hover:text-white transition-colors"
              >
                Sign Out
              </button>
            </div>
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
        {activeTab === 'termSteps' && (
          <TermStepsTab
            api={api}
            role={role}
            terms={terms}
            selectedTermId={selectedTermId}
            onTermsChange={handleTermsChange}
            onSelectTerm={setSelectedTermId}
          />
        )}
        {activeTab === 'analytics' && <AnalyticsTab api={api} termId={selectedTermId} />}
        {activeTab === 'audit' && <AuditLogTab api={api} />}
        {activeTab === 'users' && role === 'sysadmin' && <AdminUsersTab api={api} />}
      </div>
    </div>
  );
}
