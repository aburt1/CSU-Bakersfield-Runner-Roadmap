import { useCallback, useMemo } from 'react';

const API_BASE = '/api/admin';

export function useAdminApi(apiKey) {
  const request = useCallback(async (path, options = {}) => {
    const { method = 'GET', body, ...rest } = options;
    const headers = { 'X-Api-Key': apiKey, ...rest.headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }, [apiKey]);

  const get = useCallback((path) => request(path), [request]);
  const post = useCallback((path, body) => request(path, { method: 'POST', body }), [request]);
  const put = useCallback((path, body) => request(path, { method: 'PUT', body }), [request]);
  const del = useCallback((path, body) => request(path, { method: 'DELETE', body }), [request]);

  return useMemo(() => ({ get, post, put, del }), [get, post, put, del]);
}
