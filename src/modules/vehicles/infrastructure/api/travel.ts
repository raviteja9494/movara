import type { FastifyInstance } from 'fastify';
import type { VehicleTravelUseCases } from '../../application/use-cases';
import { CreateTripMergeSchema, validate } from '../../../../shared/validation';
import { actingUserId } from '../../../../shared/authorization';

export async function registerVehicleTravelRoutes(app: FastifyInstance, useCases: VehicleTravelUseCases) {
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/api/v1/vehicles/:id/trips',
    async (request, reply) => {
      const to = request.query.to ? new Date(request.query.to) : new Date();
      const from = request.query.from ? new Date(request.query.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      return reply.status(200).send({ trips: await useCases.listDerivedTrips(actingUserId(request), request.params.id, from, to) });
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/vehicles/:id/trip-merges', async (request, reply) => {
    const input = validate(request.body, CreateTripMergeSchema) as { gapAfter: string; gapBefore: string };
    const merge = await useCases.createMerge(actingUserId(request), request.params.id, new Date(input.gapAfter), new Date(input.gapBefore));
    if (!merge) return reply.status(400).send({ error: 'Vehicle has no linked device' });
    return reply.status(201).send({ id: merge.id, gapAfter: merge.gapAfter.toISOString(), gapBefore: merge.gapBefore.toISOString() });
  });

  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id/trip-merges', async (request, reply) => {
    const merges = await useCases.listMerges(actingUserId(request), request.params.id);
    return reply.status(200).send({
      tripMerges: merges.map((merge) => ({ id: merge.id, gapAfter: merge.gapAfter.toISOString(), gapBefore: merge.gapBefore.toISOString() })),
    });
  });

  app.delete<{ Params: { id: string }; Querystring: { gapAfter?: string; gapBefore?: string } }>(
    '/api/v1/vehicles/:id/trip-merges',
    async (request, reply) => {
      const { gapAfter: after, gapBefore: before } = request.query;
      if (!after || !before) return reply.status(400).send({ error: 'gapAfter and gapBefore query params required' });
      const gapAfter = new Date(after);
      const gapBefore = new Date(before);
      if (Number.isNaN(gapAfter.getTime()) || Number.isNaN(gapBefore.getTime())) {
        return reply.status(400).send({ error: 'Invalid gapAfter or gapBefore' });
      }
      const result = await useCases.deleteMerge(actingUserId(request), request.params.id, gapAfter, gapBefore);
      if (result === 'missing-device') return reply.status(400).send({ error: 'gapAfter and gapBefore query params required' });
      return reply.status(204).send();
    },
  );
}
