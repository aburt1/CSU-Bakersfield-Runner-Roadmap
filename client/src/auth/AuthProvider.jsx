import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { msalInstance, isAzureAdConfigured, loginRequest } from './msalConfig';
import { BrowserAuthError } from '@azure/msal-browser';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function sendIdTokenToServer(idToken) {
  const res = await fetch('/api/auth/sso', {
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

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem('csub_token'));
  const [loading, setLoading] = useState(true);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState('');
  const msalReady = useRef(false);
  const redirecting = useRef(false);

  // Shared handler for SSO responses (popup or redirect)
  const handleSsoResponse = useCallback(async (idToken) => {
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
            const data = await res.json();
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
    } catch (err) {
      if (err.errorCode === 'user_cancelled') {
        setSsoError('');
      } else {
        setSsoError(err.message || 'SSO login failed');
      }
    } finally {
      if (!redirecting.current) setSsoLoading(false);
    }
  }, [handleSsoResponse]);

  // Dev login — accepts name + email, gets JWT from server
  const devLogin = useCallback(async (name, email) => {
    const res = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    if (!res.ok) {
      throw new Error('Login failed');
    }
    const data = await res.json();
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
