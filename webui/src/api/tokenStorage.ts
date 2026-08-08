const TOKEN_KEY = 'movara_token';
const USER_KEY = 'movara_user';
const SYSTEM_ADMIN_TOKEN_KEY = 'movara_system_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getSystemAdminToken(): string | null {
  return localStorage.getItem(SYSTEM_ADMIN_TOKEN_KEY);
}

export function setSystemAdminToken(token: string): void {
  const value = token.trim();
  if (value) localStorage.setItem(SYSTEM_ADMIN_TOKEN_KEY, value);
  else localStorage.removeItem(SYSTEM_ADMIN_TOKEN_KEY);
}

export interface StoredUser {
  id: string;
  email: string;
}

export function getCurrentUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUser;
    return parsed?.email ? { id: parsed.id, email: parsed.email } : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify({ id: user.id, email: user.email }));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(SYSTEM_ADMIN_TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
