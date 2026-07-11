import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../../infrastructure/db';
import { validate, AuthLoginSchema, AuthRegisterSchema } from '../../../shared/validation';
import { ConflictError } from '../../../shared/errors';

const DEV_JWT_SECRET = 'movara-dev-secret-change-in-production';
const JWT_SECRET = resolveJwtSecret();
const SALT_LEN = 16;
const KEY_LEN = 64;

function resolveJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === 'production';
  if (configured && (!isProduction || (configured !== DEV_JWT_SECRET && configured.length >= 32))) {
    return configured;
  }
  if (isProduction) {
    throw new Error('JWT_SECRET must be set to a unique value of at least 32 characters in production');
  }
  return configured || DEV_JWT_SECRET;
}

function allowRegistrationAfterFirstUser(): boolean {
  const value = (process.env.ALLOW_REGISTRATION ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

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
    try {
      const user = await prisma.$transaction(
        async (tx) => {
          const userCount = await tx.user.count();
          if (userCount > 0 && !allowRegistrationAfterFirstUser()) {
            throw new ConflictError('Registration is disabled after the first user has been created');
          }
          const existing = await tx.user.findUnique({ where: { email: body.email } });
          if (existing) throw new ConflictError('User with this email already exists');
          const salt = createSalt();
          const passwordHash = hashPassword(body.password, salt);
          return tx.user.create({
            data: { email: body.email, passwordHash, salt },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const token = signToken(user.id, user.email);
      return reply.status(201).send({
        user: { id: user.id, email: user.email },
        token,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictError('User with this email already exists');
        }
        if (error.code === 'P2034') {
          throw new ConflictError('Registration was attempted concurrently; please try again');
        }
      }
      throw error;
    }
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
    if (!user) return; // 401 already sent by verifyAuth; stop chain so route handler is not invoked
    (request as FastifyRequest & { user: AuthUser }).user = user;
  });
}
