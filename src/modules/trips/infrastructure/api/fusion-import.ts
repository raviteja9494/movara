import type { FastifyInstance } from 'fastify';
import type { TripUseCases } from '../../application/use-cases';
import { FuseTripsSchema, validate, type FuseTripsRequest } from '../../../../shared/validation';
import { mapTripInputError } from './helpers';
import { actingUserId } from '../../../../shared/authorization';
import { tripSummary } from './mappers';

export async function registerTripFusionAndImportRoutes(app: FastifyInstance, useCases: TripUseCases) {
  app.get<{ Params: { id: string } }>('/api/v1/trips/:id/fusion-candidates', async (request, reply) => {
    const candidates = await useCases.fusionCandidates(actingUserId(request), request.params.id);
    return reply.status(200).send({ candidates: candidates.map((candidate) => ({ ...candidate, trip: tripSummary(candidate.trip) })) });
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id/fuse', async (request, reply) => {
    const body = validate(request.body, FuseTripsSchema) as FuseTripsRequest;
    const result = await mapTripInputError(reply, () => useCases.fuse(actingUserId(request), request.params.id, body));
    return 'pointCount' in result ? reply.status(201).send({ trip: tripSummary(result.trip), fusedTripId: result.trip.id, pointCount: result.pointCount, evaluation: result.evaluation }) : result;
  });

  app.post<{ Querystring: { vehicleId?: string; name?: string }; Body: unknown }>('/api/v1/trips/import-gpx', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'GPX file required' });
    const xml = (await data.toBuffer()).toString('utf8');
    const trip = await mapTripInputError(reply, () => useCases.importGpx(actingUserId(request), xml, request.query.vehicleId, request.query.name ?? data.filename ?? 'Imported'));
    return 'id' in trip ? reply.status(201).send({ trip: tripSummary(trip) }) : trip;
  });
}
