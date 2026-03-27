import { useCallback, useMemo } from 'react';

const API_BASE = '/api/admin';

interface RequestOptions {
  method?: string;
  body?: unknown;
  raw?: boolean;
  headers?: Record<string, string>;
}

export interface AdminApi {
  get: <T = unknown>(path: string, params?: Record<string, string | number | boolean | null | undefined>) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  del: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  raw: (path: string, options?: Omit<RequestOptions, 'raw'>) => Promise<Response>;
}

export function useAdminApi(token: string | null, onAuthError?: () => void): AdminApi {
  const request = useCallback(async <T = unknown>(path: string, options: RequestOptions = {}): Promise<T | Response> => {
    const { method = 'GET', body, raw: returnRaw, ...rest } = options;
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}`, ...rest.headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (returnRaw) return res;
    if (res.status === 401) {
      onAuthError?.();
      throw new Error('Session expired');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json() as Promise<T>;
  }, [token, onAuthError]);

  const get = useCallback(<T = unknown>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> => {
    if (params) {
      const qs = new URLSearchParams(
        Object.entries(params).filter((entry): entry is [string, string] => entry[1] != null).map(([k, v]) => [k, String(v)])
      ).toString();
      if (qs) return request<T>(`${path}?${qs}`) as Promise<T>;
    }
    return request<T>(path) as Promise<T>;
  }, [request]);
  const post = useCallback(<T = unknown>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body }) as Promise<T>, [request]);
  const put = useCallback(<T = unknown>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PUT', body }) as Promise<T>, [request]);
  const del = useCallback(<T = unknown>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'DELETE', body }) as Promise<T>, [request]);
  const raw = useCallback((path: string, options: Omit<RequestOptions, 'raw'> = {}): Promise<Response> => request(path, { ...options, raw: true }) as Promise<Response>, [request]);

  return useMemo(() => ({ get, post, put, del, raw }), [get, post, put, del, raw]);
}
