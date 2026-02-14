const TOKEN_KEY = 'movara_token';
const USER_KEY = 'movara_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
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
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
