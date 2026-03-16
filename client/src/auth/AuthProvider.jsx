import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem('csub_token'));
  const [loading, setLoading] = useState(true);

  // On mount, validate existing token
  useEffect(() => {
    async function init() {
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
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
  }, []);

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
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, devLogin, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}
