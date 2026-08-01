import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../../modules/auth/domain/entities';
import { UnauthorizedError } from '../errors';

export function actingUserId(request: FastifyRequest): string {
  const user = (request as FastifyRequest & { user?: AuthUser }).user;
  if (!user?.id) throw new UnauthorizedError('Authentication required');
  return user.id;
}
