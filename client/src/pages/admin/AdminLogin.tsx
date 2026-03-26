import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { isAzureAdConfigured, msalInstance, loginRequest } from '../../auth/msalConfig';
import { BrowserAuthError } from '@azure/msal-browser';

interface AdminUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
}

async function sendIdTokenToServer(idToken: string): Promise<{ token: string; user: AdminUser }> {
  const res = await fetch('/api/admin/auth/sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'SSO login failed');
  }
  return res.json();
}

interface Props {
  onLogin: (token: string, user: AdminUser) => void;
}

export default function AdminLogin({ onLogin }: Props) {
  // Email/password state (used when Azure AD not configured)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // SSO state
  const [ssoLoading, setSsoLoading] = useState(false);
  const [msalInitialized, setMsalInitialized] = useState(false);
  const msalReady = useRef(false);
  const redirecting = useRef(false);

  // Handle SSO response (popup or redirect)
  const handleSsoResponse = useCallback(async (idToken: string) => {
    const data = await sendIdTokenToServer(idToken);
    onLogin(data.token, data.user);
  }, [onLogin]);

  // Initialize MSAL on mount
  useEffect(() => {
    if (!isAzureAdConfigured || !msalInstance) {
      setMsalInitialized(true);
      return;
    }

    async function init() {
      try {
        await msalInstance!.initialize();
        msalReady.current = true;

        const redirectResponse = await msalInstance!.handleRedirectPromise();
        if (redirectResponse?.idToken) {
          setSsoLoading(true);
          await handleSsoResponse(redirectResponse.idToken);
          return; // Redirect login succeeded
        }
      } catch (err: any) {
        setError(err.message || 'SSO initialization failed');
      }
      setMsalInitialized(true);
    }
    init();
  }, [handleSsoResponse]);

  // SSO login — popup with redirect fallback
  const handleSsoLogin = async () => {
    if (!msalInstance || !msalReady.current) return;
    setSsoLoading(true);
    setError('');
    try {
      let response;
      try {
        response = await msalInstance.loginPopup(loginRequest);
      } catch (err: any) {
        if (
          err instanceof BrowserAuthError &&
          ['popup_window_error', 'empty_window_error', 'popup_timeout'].includes(err.errorCode)
        ) {
          redirecting.current = true;
          await msalInstance.loginRedirect(loginRequest);
          return;
        }
        throw err;
      }
      if (response?.idToken) {
        await handleSsoResponse(response.idToken);
      }
    } catch (err: any) {
      if (err.errorCode === 'user_cancelled') {
        setError('');
      } else {
        setError(err.message || 'SSO login failed');
      }
    } finally {
      if (!redirecting.current) setSsoLoading(false);
    }
  };

  // Email/password login (when Azure AD not configured)
  const handlePasswordLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        onLogin(data.token, data.user);
      } else {
        setError(data.error || 'Invalid credentials.');
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
          {isAzureAdConfigured
            ? 'Sign in with your CSUB account.'
            : 'Sign in with your admin credentials.'}
        </p>

        {isAzureAdConfigured ? (
          /* SSO login */
          <div className="space-y-4">
            <button
              onClick={handleSsoLogin}
              disabled={ssoLoading || !msalInitialized}
              className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-3 rounded-lg shadow transition-colors duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {ssoLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign in with CSUB Account'
              )}
            </button>
            {error && <p className="text-red-600 text-sm font-body text-center">{error}</p>}
          </div>
        ) : (
          /* Email/password login */
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
            {error && <p className="text-red-600 text-sm font-body">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-3 rounded-lg shadow transition-colors duration-200 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
