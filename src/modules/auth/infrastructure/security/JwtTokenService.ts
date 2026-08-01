import jwt from 'jsonwebtoken';
import type { AuthUserToken, TokenService } from '../../domain/repositories';
export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string) {}
  sign(user: AuthUserToken) { return jwt.sign({ sub: user.id, email: user.email }, this.secret, { expiresIn: '7d' }); }
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
