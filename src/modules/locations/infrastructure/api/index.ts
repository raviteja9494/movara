import { FastifyInstance } from 'fastify';
import {
  validate,
  CreateSavedLocationSchema,
  UpdateSavedLocationSchema,
} from '../../../../shared/validation';
import { actingUserId } from '../../../../shared/authorization';
import type { LocationUseCases } from '../../application/use-cases';
import { savedLocationToDto } from './mappers';

export async function registerLocationRoutes(app: FastifyInstance, locations: LocationUseCases) {
  app.get('/api/v1/locations', async (request) => {
    const userId = actingUserId(request);
    return {
      locations: (await locations.list(userId)).map(savedLocationToDto),
    };
  });

  app.post<{ Body: unknown }>('/api/v1/locations', async (request, reply) => {
    const validated = validate(request.body, CreateSavedLocationSchema);
    const userId = actingUserId(request);
    const location = await locations.create(userId, {
      name: validated.name,
      latitude: validated.latitude,
      longitude: validated.longitude,
      notes: validated.notes ?? null,
    });
    return reply.status(201).send({ location: savedLocationToDto(location) });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/locations/:id', async (request, reply) => {
    const validated = validate(request.body, UpdateSavedLocationSchema);
    const userId = actingUserId(request);
    const location = await locations.update(userId, request.params.id, {
      name: validated.name,
      latitude: validated.latitude,
      longitude: validated.longitude,
      notes: validated.notes,
    });
    return reply.status(200).send({ location: savedLocationToDto(location) });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/locations/:id', async (request, reply) => {
    const userId = actingUserId(request);
    await locations.delete(userId, request.params.id);
    return reply.status(204).send();
  });
}
