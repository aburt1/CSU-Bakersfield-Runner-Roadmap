import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { msalInstance, isAzureAdConfigured, loginRequest } from './msalConfig.js';
import { BrowserAuthError } from '@azure/msal-browser';

interface User {
  id: number;
  name: string;
  email: string;
  [key: string]: unknown;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  devLogin: (name: string, email: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  ssoLogin: () => Promise<void>;
  ssoLoading: boolean;
  ssoError: string;
  isAzureAdConfigured: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

interface SsoLoginResponse {
  token: string;
  student: User;
}

async function sendIdTokenToServer(idToken: string): Promise<SsoLoginResponse> {
  const res = await fetch('/api/auth/sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'SSO login failed');
  }
  return res.json() as Promise<SsoLoginResponse>;
}

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('csub_token'));
  const [loading, setLoading] = useState(true);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState('');
  const msalReady = useRef(false);
  const redirecting = useRef(false);

  // Shared handler for SSO responses (popup or redirect)
  const handleSsoResponse = useCallback(async (idToken: string) => {
    const data = await sendIdTokenToServer(idToken);
    sessionStorage.setItem('csub_token', data.token);
    setToken(data.token);
    setUser(data.student);
  }, []);

  // On mount: initialize MSAL, handle redirect, then validate existing token
  useEffect(() => {
    async function init() {
      // Step 1: Initialize MSAL and handle redirect response (if any)
      if (isAzureAdConfigured && msalInstance) {
        try {
          await msalInstance.initialize();
          msalReady.current = true;
          const redirectResponse = await msalInstance.handleRedirectPromise();
          if (redirectResponse?.idToken) {
            await handleSsoResponse(redirectResponse.idToken);
            setLoading(false);
            return; // Redirect login succeeded — skip /me check
          }
        } catch {
          // MSAL init or redirect handling failed — continue to normal flow
        }
      }

      // Step 2: Validate existing token via /api/auth/me
      const existingToken = sessionStorage.getItem('csub_token');
      if (existingToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${existingToken}` },
          });
          if (res.ok) {
            const data: User = await res.json();
            setUser(data);
          } else {
            sessionStorage.removeItem('csub_token');
            setToken(null);
          }
        } catch {
          // Server unavailable
        }
      }
      setLoading(false);
    }
    init();
  }, [handleSsoResponse]);

  // SSO login — popup with redirect fallback
  const ssoLogin = useCallback(async () => {
    if (!msalInstance || !msalReady.current) return;
    setSsoLoading(true);
    setSsoError('');
    try {
      let response;
      try {
        response = await msalInstance.loginPopup(loginRequest);
      } catch (err) {
        // Popup blocked/failed — fall back to redirect
        if (
          err instanceof BrowserAuthError &&
          ['popup_window_error', 'empty_window_error', 'popup_timeout'].includes(err.errorCode)
        ) {
          redirecting.current = true;
          await msalInstance.loginRedirect(loginRequest);
          return; // Page will redirect — no further action
        }
        throw err; // Re-throw non-popup errors (e.g., user cancelled)
      }
      if (response?.idToken) {
        await handleSsoResponse(response.idToken);
      }
    } catch (err: unknown) {
      const authErr = err as { errorCode?: string; message?: string };
      if (authErr.errorCode === 'user_cancelled') {
        setSsoError('');
      } else {
        setSsoError(authErr.message || 'SSO login failed');
      }
    } finally {
      if (!redirecting.current) setSsoLoading(false);
    }
  }, [handleSsoResponse]);

  // Dev login — accepts name + email, gets JWT from server
  const devLogin = useCallback(async (name: string, email: string) => {
    const res = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    if (!res.ok) {
      throw new Error('Login failed');
    }
    const data: SsoLoginResponse = await res.json();
    sessionStorage.setItem('csub_token', data.token);
    setToken(data.token);
    setUser(data.student);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('csub_token');
    setToken(null);
    setUser(null);
    // Clear MSAL cache to prevent stale Azure AD tokens
    if (isAzureAdConfigured && msalInstance && msalReady.current) {
      msalInstance.clearCache();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        devLogin,
        logout,
        isAuthenticated: !!token,
        ssoLogin,
        ssoLoading,
        ssoError,
        isAzureAdConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
