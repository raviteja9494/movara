import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthUseCases } from '../application/use-cases';
import { InvalidCredentialsError } from '../application/use-cases';
import type { AuthUser } from '../domain/entities';
import { AuthLoginSchema, AuthRegisterSchema, validate } from '../../../shared/validation';

export type { AuthUser } from '../domain/entities';

const authRateLimit = {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute',
    },
  },
};

export async function verifyAuth(request: FastifyRequest, reply: FastifyReply, useCases: AuthUseCases): Promise<AuthUser | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Missing or invalid Authorization header' });
    return null;
  }
  const user = useCases.verify(header.slice(7));
  if (!user) {
    reply.status(401).send({ error: true, message: 'Invalid or expired token' });
    return null;
  }
  return user;
}

export async function registerAuthRoutes(app: FastifyInstance, useCases: AuthUseCases) {
  app.post<{ Body: unknown }>('/api/v1/auth/register', authRateLimit, async (request, reply) => {
    const body = validate(request.body, AuthRegisterSchema);
    return reply.status(201).send(await useCases.register(body.email, body.password));
  });
  app.post<{ Body: unknown }>('/api/v1/auth/login', authRateLimit, async (request, reply) => {
    const body = validate(request.body, AuthLoginSchema);
    try { return reply.status(200).send(await useCases.login(body.email, body.password)); }
    catch (error) {
      if (error instanceof InvalidCredentialsError) return reply.status(401).send({ error: true, message: 'Invalid email or password' });
      throw error;
    }
  });
}

export function registerAuthHook(app: FastifyInstance, useCases: AuthUseCases) {
  app.addHook('preHandler', async (request, reply) => {
    const url = request.url.split('?')[0];
    if (url === '/health' || url.startsWith('/api/v1/auth/') || !url.startsWith('/api/v1')) return;
    const user = await verifyAuth(request, reply, useCases);
    if (user) (request as FastifyRequest & { user: AuthUser }).user = user;
  });
}
