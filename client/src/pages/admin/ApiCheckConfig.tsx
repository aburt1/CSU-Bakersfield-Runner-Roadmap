import { useCallback, useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface HeaderEntry {
  key: string;
  value: string;
}

interface ApiCheckConfigData {
  configured: boolean;
  is_enabled: boolean;
  http_method: string;
  url: string;
  auth_type: string;
  auth_credentials: string;
  student_param_source: string;
  response_field_path: string;
  headers: HeaderEntry[];
}

interface TestResultData {
  error?: string;
  statusCode?: number;
  extractedValue?: any;
  wouldMarkComplete?: boolean;
  responseBody?: string;
}

interface Props {
  stepId: number;
  api: AdminApi;
}

export default function ApiCheckConfig({ stepId, api }: Props) {
  const [config, setConfig] = useState<ApiCheckConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResultData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [httpMethod, setHttpMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState('none');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [headers, setHeaders] = useState<HeaderEntry[]>([]);
  const [studentParamSource, setStudentParamSource] = useState('emplid');
  const [responseFieldPath, setResponseFieldPath] = useState('');
  const [testStudentId, setTestStudentId] = useState('');

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-body text-sm focus:outline-none focus:ring-1 focus:ring-csub-blue';
  const label = 'block font-body text-xs font-semibold text-csub-blue-dark mb-1';

  const fetchConfig = useCallback(async () => {
    try {
      const data: ApiCheckConfigData = await api.get(`/steps/${stepId}/api-check`);
      setConfig(data);
      if (data.configured) {
        setEnabled(data.is_enabled);
        setHttpMethod(data.http_method || 'GET');
        setUrl(data.url || '');
        setAuthType(data.auth_type || 'none');
        setStudentParamSource(data.student_param_source || 'emplid');
        setResponseFieldPath(data.response_field_path || '');
        if (data.auth_credentials === '••••••••') {
          if (data.auth_type === 'basic') {
            setUsername('••••••••');
            setPassword('••••••••');
          } else if (data.auth_type === 'bearer') {
            setBearerToken('••••••••');
          }
        }
        if (Array.isArray(data.headers)) {
          setHeaders(data.headers);
        }
        setExpanded(true);
      }
    } catch {
      // No config yet — that's fine
    } finally {
      setLoading(false);
    }
  }, [api, stepId]);

  useEffect(() => {
    if (stepId) fetchConfig();
  }, [stepId, fetchConfig]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      let authCredentials: string | null = null;
      if (authType === 'basic') {
        if (username !== '••••••••' || password !== '••••••••') {
          authCredentials = JSON.stringify({ username, password });
        } else {
          authCredentials = '••••••••';
        }
      } else if (authType === 'bearer') {
        if (bearerToken !== '••••••••') {
          authCredentials = JSON.stringify({ token: bearerToken });
        } else {
          authCredentials = '••••••••';
        }
      }

      await api.put(`/steps/${stepId}/api-check`, {
        is_enabled: enabled,
        http_method: httpMethod,
        url,
        auth_type: authType,
        auth_credentials: authCredentials,
        headers: headers.filter(h => h.key),
        student_param_source: studentParamSource,
        response_field_path: responseFieldPath,
      });
      setSuccess('API check saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove API check configuration for this step?')) return;
    try {
      await api.del(`/steps/${stepId}/api-check`);
      setConfig(null);
      setUrl('');
      setResponseFieldPath('');
      setAuthType('none');
      setHeaders([]);
      setExpanded(false);
      setSuccess('API check removed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTest = async () => {
    if (!testStudentId) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await api.post(`/steps/${stepId}/api-check/test`, { testStudentId });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setTestLoading(false);
    }
  };

  const addHeader = () => setHeaders([...headers, { key: '', value: '' }]);
  const removeHeader = (idx: number) => setHeaders(headers.filter((_, i) => i !== idx));
  const updateHeader = (idx: number, prop: keyof HeaderEntry, value: string) => {
    const updated = [...headers];
    updated[idx] = { ...updated[idx]!, [prop]: value };
    setHeaders(updated);
  };

  if (loading) return null;

  return (
    <div className="mt-4 border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <span className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wider">
          API Check {config?.configured && <span className="text-green-600 text-xs font-body normal-case ml-2">Configured</span>}
        </span>
        <span className="text-csub-gray text-xs">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {error && <p className="text-red-600 text-xs font-body">{error}</p>}
          {success && <p className="text-green-600 text-xs font-body">{success}</p>}

          <div className="flex items-center gap-3">
            <label className="font-body text-sm text-csub-blue-dark font-semibold">Enable</label>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-csub-blue' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>HTTP Method</label>
              <select value={httpMethod} onChange={(e: ChangeEvent<HTMLSelectElement>) => setHttpMethod(e.target.value)} className={field}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <div>
              <label className={label}>Student Parameter Source</label>
              <select value={studentParamSource} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStudentParamSource(e.target.value)} className={field}>
                <option value="emplid">Campus ID (emplid)</option>
                <option value="email">Email</option>
              </select>
            </div>
          </div>

          <div>
            <label className={label}>URL</label>
            <input
              type="text"
              value={url}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              className={field}
              placeholder="https://api.example.com/check/{{studentId}}"
            />
            <p className="font-body text-xs text-csub-gray mt-0.5">Use {'{{studentId}}'} as placeholder for the student identifier</p>
          </div>

          <div>
            <label className={label}>Authentication Type</label>
            <select value={authType} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAuthType(e.target.value)} className={field}>
              <option value="none">None</option>
              <option value="basic">Basic</option>
              <option value="bearer">Bearer Token</option>
            </select>
          </div>

          {authType === 'basic' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Username</label>
                <input type="text" value={username} onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} className={field} />
              </div>
              <div>
                <label className={label}>Password</label>
                <input type="password" value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} className={field} />
              </div>
            </div>
          )}

          {authType === 'bearer' && (
            <div>
              <label className={label}>Bearer Token</label>
              <input type="password" value={bearerToken} onChange={(e: ChangeEvent<HTMLInputElement>) => setBearerToken(e.target.value)} className={field} />
            </div>
          )}

          <div>
            <label className={label}>Custom Headers</label>
            {headers.map((h, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <input
                  type="text"
                  value={h.key}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateHeader(i, 'key', e.target.value)}
                  className={field}
                  placeholder="Header name"
                />
                <input
                  type="text"
                  value={h.value}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateHeader(i, 'value', e.target.value)}
                  className={field}
                  placeholder="Value"
                />
                <button type="button" onClick={() => removeHeader(i)} className="text-red-500 text-xs font-body hover:text-red-700 shrink-0">
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={addHeader} className="text-csub-blue text-xs font-body hover:underline">
              + Add Header
            </button>
          </div>

          <div>
            <label className={label}>Response Field Path</label>
            <input
              type="text"
              value={responseFieldPath}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setResponseFieldPath(e.target.value)}
              className={field}
              placeholder="data.is_complete"
            />
            <p className="font-body text-xs text-csub-gray mt-0.5">Dot-notation path to the boolean field in the JSON response</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !url || !responseFieldPath}
              className="bg-csub-blue hover:bg-csub-blue-dark disabled:opacity-50 text-white font-display font-bold uppercase tracking-wider px-4 py-2 rounded-lg shadow transition-colors text-xs"
            >
              {saving ? 'Saving...' : 'Save API Check'}
            </button>
            {config?.configured && (
              <button
                type="button"
                onClick={handleDelete}
                className="border border-red-300 text-red-600 hover:bg-red-50 font-body px-4 py-2 rounded-lg transition-colors text-xs"
              >
                Remove
              </button>
            )}
          </div>

          {/* Test Section */}
          <div className="border-t border-gray-200 pt-3 mt-3">
            <label className={label}>Test API Check</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testStudentId}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTestStudentId(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleTest();
                  }
                }}
                className={field}
                placeholder="Test student ID (e.g., 001001000)"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testLoading || !testStudentId}
                className="shrink-0 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-csub-blue-dark font-body font-semibold px-4 py-2 rounded-lg transition-colors text-xs"
              >
                {testLoading ? 'Testing...' : 'Test'}
              </button>
            </div>
            {testResult && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs font-body space-y-1">
                {testResult.error ? (
                  <p className="text-red-600">{testResult.error}</p>
                ) : (
                  <>
                    <p><span className="font-semibold">Status:</span> {testResult.statusCode}</p>
                    <p><span className="font-semibold">Extracted Value:</span> {JSON.stringify(testResult.extractedValue)}</p>
                    <p><span className="font-semibold">Would Mark Complete:</span> {testResult.wouldMarkComplete ? 'Yes' : 'No'}</p>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-csub-gray hover:text-csub-blue-dark">Raw Response</summary>
                      <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-x-auto max-h-40 overflow-y-auto">
                        {testResult.responseBody}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
