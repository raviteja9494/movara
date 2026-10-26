import { api } from './client';
import { getToken, setToken } from './tokenStorage';

const LAST_REFRESH_KEY = 'movara_last_session_refresh';
const MAX_REFRESH_ATTEMPT_INTERVAL_MS = 60 * 60 * 1000;

export interface TokenLifetimeClaims {
  iat: number;
  exp: number;
}

export function readTokenLifetimeClaims(token: string): TokenLifetimeClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as {
      iat?: unknown;
      exp?: unknown;
    };
    if (typeof decoded.iat !== 'number' || typeof decoded.exp !== 'number' || decoded.exp <= decoded.iat) return null;
    return { iat: decoded.iat, exp: decoded.exp };
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<void> | null = null;

export function refreshSession(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const token = getToken();
      if (!token) return;
      const claims = readTokenLifetimeClaims(token);
      if (!claims) return;

      const now = Date.now();
      const issuedAtMs = claims.iat * 1000;
      const expiresAtMs = claims.exp * 1000;
      if (now <= issuedAtMs + (expiresAtMs - issuedAtMs) / 2) return;

      const lastAttempt = Number(localStorage.getItem(LAST_REFRESH_KEY));
      if (Number.isFinite(lastAttempt) && now - lastAttempt < MAX_REFRESH_ATTEMPT_INTERVAL_MS) return;
      localStorage.setItem(LAST_REFRESH_KEY, String(now));

      const response = await api.post<{ token: string }>('/auth/refresh');
      if (response.token) setToken(response.token);
    } catch {
      // A refresh is opportunistic; normal API requests handle expired sessions.
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
