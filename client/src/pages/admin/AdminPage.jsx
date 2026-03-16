import { useState, useEffect } from 'react';
import { useAdminApi } from './hooks/useAdminApi';
import AdminLogin from './AdminLogin';
import StudentsTab from './StudentsTab';
import StepsTab from './StepsTab';
import AuditLogTab from './AuditLogTab';

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
        {activeTab === 'students' && <StudentsTab api={api} steps={steps} />}
        {activeTab === 'steps' && <StepsTab api={api} />}
        {activeTab === 'audit' && <AuditLogTab api={api} />}
      </div>
    </div>
  );
}
