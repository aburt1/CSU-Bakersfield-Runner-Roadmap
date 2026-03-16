import { useState, useEffect } from 'react';
import { useAdminApi } from './hooks/useAdminApi';
import AdminLogin from './AdminLogin';
import StudentsTab from './StudentsTab';
import StepsTab from './StepsTab';
import AuditLogTab from './AuditLogTab';

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
  audit: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function AdminPage() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('csub_admin_key'));
  const [activeTab, setActiveTab] = useState('students');
  const [steps, setSteps] = useState([]);
  const api = useAdminApi(apiKey);

  const handleLogin = (key) => {
    sessionStorage.setItem('csub_admin_key', key);
    setApiKey(key);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('csub_admin_key');
    setApiKey(null);
  };

  useEffect(() => {
    if (!apiKey) return;
    api.get('/steps').then(setSteps).catch(() => {});
  }, [apiKey, api]);

  if (!apiKey) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const tabs = [
    { key: 'students', label: 'Students' },
    { key: 'steps', label: 'Steps' },
    { key: 'audit', label: 'Audit Log' },
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
          <button
            onClick={handleLogout}
            className="font-body text-sm text-white/60 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 py-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-all ${
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'students' && <StudentsTab api={api} steps={steps} />}
        {activeTab === 'steps' && <StepsTab api={api} />}
        {activeTab === 'audit' && <AuditLogTab api={api} />}
      </div>
    </div>
  );
}
