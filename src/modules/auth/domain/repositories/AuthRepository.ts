import type { User } from '../entities';
export class RegistrationDisabledError extends Error {}
export class DuplicateUserError extends Error {}
export class ConcurrentRegistrationError extends Error {}
export interface AuthRepository {
  register(user: User, allowAfterFirstUser: boolean): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}
export interface PasswordService { createSalt(): string; hash(password: string, salt: string): string }
export interface TokenService { sign(user: AuthUserToken): string; verify(token: string): AuthUserToken | null }
export interface AuthUserToken { id: string; email: string }
