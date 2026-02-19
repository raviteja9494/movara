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

function looksLikeHtml(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('<') && (trimmed.startsWith('<!') || trimmed.startsWith('<html'));
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (text && looksLikeHtml(text)) {
    const hint =
      response.url && !response.url.includes('/api/')
        ? ' The server returned a page instead of JSON. Check Settings → API URL: it should point to your Movara backend (e.g. https://your-server/api/v1).'
        : ' The server returned HTML instead of JSON. Check that the API backend is running and the API URL in Settings is correct.';
    throw new Error(`Invalid response from server.${hint}`);
  }

  let data: T | undefined;
  try {
    data = text ? (JSON.parse(text) as T) : (undefined as T);
  } catch {
    throw new Error(
      response.ok
        ? 'Invalid JSON in response.'
        : `Server error (${response.status}): ${response.statusText}. Check API URL in Settings.`,
    );
  }

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
