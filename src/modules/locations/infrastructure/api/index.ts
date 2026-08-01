import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  validate,
  CreateSavedLocationSchema,
  UpdateSavedLocationSchema,
} from '../../../../shared/validation';
import { NotFoundError } from '../../../../shared/errors';
import { actingUserId } from '../../../../shared/authorization';

export async function registerLocationRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get('/api/v1/locations', async (request) => {
    const userId = actingUserId(request);
    return {
      locations: await prisma.savedLocation.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    };
  });

  app.post<{ Body: unknown }>('/api/v1/locations', async (request, reply) => {
    const validated = validate(request.body, CreateSavedLocationSchema);
    const userId = actingUserId(request);
    const location = await prisma.savedLocation.create({
      data: {
        userId,
        name: validated.name.trim(),
        latitude: validated.latitude,
        longitude: validated.longitude,
        notes: validated.notes ?? null,
      },
    });
    return reply.status(201).send({ location });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/locations/:id', async (request, reply) => {
    const validated = validate(request.body, UpdateSavedLocationSchema);
    const userId = actingUserId(request);
    const existing = await prisma.savedLocation.findFirst({ where: { id: request.params.id, userId } });
    if (!existing) throw new NotFoundError('SavedLocation', request.params.id);
    await prisma.savedLocation.updateMany({
      where: { id: request.params.id, userId },
      data: {
        name: validated.name?.trim(),
        latitude: validated.latitude,
        longitude: validated.longitude,
        notes: validated.notes,
      },
    });
    const location = await prisma.savedLocation.findFirstOrThrow({ where: { id: request.params.id, userId } });
    return reply.status(200).send({ location });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/locations/:id', async (request, reply) => {
    const userId = actingUserId(request);
    const existing = await prisma.savedLocation.findFirst({ where: { id: request.params.id, userId } });
    if (!existing) throw new NotFoundError('SavedLocation', request.params.id);
    await prisma.savedLocation.deleteMany({ where: { id: request.params.id, userId } });
    return reply.status(204).send();
  });
}
