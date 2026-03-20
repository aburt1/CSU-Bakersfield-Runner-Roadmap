import { useCallback, useMemo } from 'react';

const API_BASE = '/api/admin';

export function useAdminApi(token) {
  const request = useCallback(async (path, options = {}) => {
    const { method = 'GET', body, raw: returnRaw, ...rest } = options;
    const headers = { 'Authorization': `Bearer ${token}`, ...rest.headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (returnRaw) return res;
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }, [token]);

  const get = useCallback((path) => request(path), [request]);
  const post = useCallback((path, body) => request(path, { method: 'POST', body }), [request]);
  const put = useCallback((path, body) => request(path, { method: 'PUT', body }), [request]);
  const del = useCallback((path, body) => request(path, { method: 'DELETE', body }), [request]);
  const raw = useCallback((path, options = {}) => request(path, { ...options, raw: true }), [request]);

  return useMemo(() => ({ get, post, put, del, raw }), [get, post, put, del, raw]);
}
