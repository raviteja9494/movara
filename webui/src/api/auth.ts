/**
 * Auth API. Token storage is in tokenStorage.ts to avoid circular dependency with client.
 */

import { api } from './client';

export { getToken, setToken, clearToken, isLoggedIn } from './tokenStorage';

export interface AuthUser {
  id: string;
  email: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/login', { email, password });
}

export async function register(email: string, password: string): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/register', { email, password });
}
