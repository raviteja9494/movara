import crypto from 'crypto';
import { ForbiddenError } from '../errors';

/** Protects instance-wide operations that cannot be safely scoped to one tenant. */
export class InstanceOperatorPolicy {
  constructor(private readonly configuredToken: string | undefined) {}

  assertAuthorized(providedToken: string | string[] | undefined): void {
    const provided = Array.isArray(providedToken) ? providedToken[0] : providedToken;
    if (!this.configuredToken || !provided) throw new ForbiddenError('Instance operator authorization required');
    const expectedBytes = Buffer.from(this.configuredToken);
    const providedBytes = Buffer.from(provided);
    if (expectedBytes.length !== providedBytes.length || !crypto.timingSafeEqual(expectedBytes, providedBytes)) {
      throw new ForbiddenError('Instance operator authorization required');
    }
  }
}

export function resolveInstanceOperatorToken(): string | undefined {
  const token = process.env.SYSTEM_ADMIN_TOKEN?.trim();
  if (process.env.NODE_ENV === 'production' && (!token || token.length < 32)) {
    throw new Error('SYSTEM_ADMIN_TOKEN must be set to a unique value of at least 32 characters in production');
  }
  return token || undefined;
}
