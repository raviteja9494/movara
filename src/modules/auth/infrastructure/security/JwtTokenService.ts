import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AuthUserToken, TokenService } from '../../domain/repositories';
export const DEFAULT_JWT_EXPIRES_IN = '30d';
const JWT_EXPIRES_IN_PATTERN = /^\d+[smhd]$/;

export function resolveJwtExpiresIn(
  value: string | undefined = process.env.JWT_EXPIRES_IN,
  warn: (message: string) => void = (message) => console.warn(message),
): string {
  if (value === undefined) return DEFAULT_JWT_EXPIRES_IN;
  const configured = value.trim();
  if (JWT_EXPIRES_IN_PATTERN.test(configured)) return configured;
  warn(`Invalid JWT_EXPIRES_IN value; using ${DEFAULT_JWT_EXPIRES_IN}.`);
  return DEFAULT_JWT_EXPIRES_IN;
}

export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string, private readonly expiresIn = DEFAULT_JWT_EXPIRES_IN) {}
  sign(user: AuthUserToken, jwtId?: string) {
    return jwt.sign(
      { sub: user.id, email: user.email },
      this.secret,
      { expiresIn: this.expiresIn as SignOptions['expiresIn'], ...(jwtId ? { jwtid: jwtId } : {}) },
    );
  }
  verify(token: string): AuthUserToken | null {
    try { const decoded = jwt.verify(token, this.secret) as { sub: string; email: string }; return { id: decoded.sub, email: decoded.email }; }
    catch { return null; }
  }
}

export function resolveJwtSecret(): string {
  const fallback = 'movara-dev-secret-change-in-production';
  const configured = process.env.JWT_SECRET?.trim(), production = process.env.NODE_ENV === 'production';
  if (configured && (!production || (configured !== fallback && configured.length >= 32))) return configured;
  if (production) throw new Error('JWT_SECRET must be set to a unique value of at least 32 characters in production');
  return configured || fallback;
}

export function registrationAfterFirstUserEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.ALLOW_REGISTRATION ?? '').trim().toLowerCase());
}
