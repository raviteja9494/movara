import { FastifyInstance } from 'fastify';
import {
  validate,
  CreateSavedLocationSchema,
  UpdateSavedLocationSchema,
} from '../../../../shared/validation';
import { NotFoundError } from '../../../../shared/errors';
import { savedLocationStore } from '../store/FileSavedLocationStore';

export async function registerLocationRoutes(app: FastifyInstance) {
  app.get('/api/v1/locations', async () => {
    return {
      locations: savedLocationStore.list(),
    };
  });

  app.post<{ Body: unknown }>('/api/v1/locations', async (request, reply) => {
    const validated = validate(request.body, CreateSavedLocationSchema);
    const location = savedLocationStore.create({
      name: validated.name,
      latitude: validated.latitude,
      longitude: validated.longitude,
      notes: validated.notes ?? null,
    });
    return reply.status(201).send({ location });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/locations/:id', async (request, reply) => {
    const validated = validate(request.body, UpdateSavedLocationSchema);
    const location = savedLocationStore.update(request.params.id, {
      name: validated.name,
      latitude: validated.latitude,
      longitude: validated.longitude,
      notes: validated.notes,
    });
    if (!location) throw new NotFoundError('SavedLocation', request.params.id);
    return reply.status(200).send({ location });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/locations/:id', async (request, reply) => {
    const deleted = savedLocationStore.delete(request.params.id);
    if (!deleted) throw new NotFoundError('SavedLocation', request.params.id);
    return reply.status(204).send();
  });
}
