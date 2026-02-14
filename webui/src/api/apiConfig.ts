/**
 * Runtime API base URL. When set (e.g. from Settings), all API requests use this.
 * Empty string = use build default.
 */
const API_BASE_URL_KEY = 'movara_api_base_url';

const DEFAULT_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? '/api/v1' : 'http://localhost:3000/api/v1');

export function getApiBaseUrl(): string {
  try {
    const stored = localStorage.getItem(API_BASE_URL_KEY)?.trim();
    if (stored) return stored.endsWith('/') ? stored.slice(0, -1) : stored;
  } catch {
    // ignore
  }
  return DEFAULT_BASE_URL;
}

export function setApiBaseUrl(url: string): void {
  const val = url.trim();
  if (val) {
    localStorage.setItem(API_BASE_URL_KEY, val.endsWith('/') ? val.slice(0, -1) : val);
  } else {
    localStorage.removeItem(API_BASE_URL_KEY);
  }
}

export function getDefaultApiBaseUrl(): string {
  return DEFAULT_BASE_URL;
}
