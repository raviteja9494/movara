import { getToken, clearToken } from './tokenStorage';
import { getApiBaseUrl } from './apiConfig';

/**
 * API client: base URL from getApiBaseUrl() (Settings or default).
 * In dev we default to /api/v1 so Vite proxies to the backend (no CORS).
 */
export const apiBaseUrl = getApiBaseUrl();

function resolveUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export interface ApiError {
  error: true;
  message: string;
  code?: string;
  fields?: Record<string, string[]>;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : (undefined as T);

  if (!response.ok) {
    const err = (data ?? {}) as ApiError;
    const error = new Error(err.message ?? response.statusText) as Error & { status?: number; code?: string; fields?: Record<string, string[]> };
    error.status = response.status;
    error.code = err.code;
    error.fields = err.fields;
    throw error;
  }

  return data as T;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Typed fetch wrapper. Uses apiBaseUrl for all requests.
 * @param path - Path relative to base URL (e.g. '/vehicles' or 'vehicles')
 * @param options - method, body (JSON-serialized), extra headers
 * @returns Promise resolving to typed response data
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers: extraHeaders = {} } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extraHeaders,
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body !== undefined && body !== null && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const init: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined && body !== null && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(resolveUrl(path), init);
  /* Only redirect to login on 401 for protected routes; let login endpoint 401 throw so the form can show the error */
  if (response.status === 401 && !path.includes('/auth/login')) {
    clearToken();
    window.location.href = '/login';
    return new Promise(() => {});
  }
  return parseResponse<T>(response);
}

export const api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return request<T>(path, { method: 'GET', headers });
  },
  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return request<T>(path, { method: 'POST', body, headers });
  },
  put<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return request<T>(path, { method: 'PUT', body, headers });
  },
  patch<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return request<T>(path, { method: 'PATCH', body, headers });
  },
  delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return request<T>(path, { method: 'DELETE', headers });
  },
};
