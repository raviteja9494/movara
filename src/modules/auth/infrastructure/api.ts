import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getPrismaClient } from '../../../infrastructure/db';
import { validate, AuthLoginSchema, AuthRegisterSchema } from '../../../shared/validation';
import { ConflictError } from '../../../shared/errors';

const JWT_SECRET = process.env.JWT_SECRET || 'movara-dev-secret-change-in-production';
const SALT_LEN = 16;
const KEY_LEN = 64;

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, KEY_LEN).toString('hex');
}

function createSalt(): string {
  return crypto.randomBytes(SALT_LEN).toString('hex');
}

function signToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

export interface AuthUser {
  id: string;
  email: string;
}

export async function verifyAuth(request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Missing or invalid Authorization header' });
    return null;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    return { id: decoded.sub, email: decoded.email };
  } catch {
    reply.status(401).send({ error: true, message: 'Invalid or expired token' });
    return null;
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: unknown }>('/api/v1/auth/register', async (request, reply) => {
    const body = validate(request.body, AuthRegisterSchema) as { email: string; password: string };
    const prisma = getPrismaClient();
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ConflictError('User with this email already exists');
    const salt = createSalt();
    const passwordHash = hashPassword(body.password, salt);
    const user = await prisma.user.create({
      data: { email: body.email, passwordHash, salt },
    });
    const token = signToken(user.id, user.email);
    return reply.status(201).send({
      user: { id: user.id, email: user.email },
      token,
    });
  });

  app.post<{ Body: unknown }>('/api/v1/auth/login', async (request, reply) => {
    const body = validate(request.body, AuthLoginSchema) as { email: string; password: string };
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      return reply.status(401).send({ error: true, message: 'Invalid email or password' });
    }
    const hash = hashPassword(body.password, user.salt);
    if (hash !== user.passwordHash) {
      return reply.status(401).send({ error: true, message: 'Invalid email or password' });
    }
    const token = signToken(user.id, user.email);
    return reply.status(200).send({
      user: { id: user.id, email: user.email },
      token,
    });
  });
}

/** Register a preHandler hook that requires JWT for /api/v1/* except /api/v1/auth/* and /health */
export function registerAuthHook(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const url = request.url.split('?')[0];
    if (url === '/health' || url.startsWith('/api/v1/auth/')) return;
    if (!url.startsWith('/api/v1')) return;
    const user = await verifyAuth(request, reply);
    if (user) (request as FastifyRequest & { user: AuthUser }).user = user;
  });
}
