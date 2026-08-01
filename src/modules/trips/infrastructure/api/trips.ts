import type { FastifyInstance } from 'fastify';
import type { TripUseCases } from '../../application/use-cases';
import { CreateTripSchema, ListTripsQuerySchema, UpdateTripSchema, validate } from '../../../../shared/validation';
import { mapTripInputError } from './helpers';
import { actingUserId } from '../../../../shared/authorization';
import { stopDto, tripSummary } from './mappers';

export async function registerTripCrudRoutes(app: FastifyInstance, useCases: TripUseCases) {
  app.get<{ Querystring: unknown }>('/api/v1/trips', async (request, reply) => {
    const query = validate(request.query, ListTripsQuerySchema) as { vehicleId?: string; deviceId?: string; favorite?: 'true' | 'false'; from?: string; to?: string; page: number; limit: number };
    const result = await useCases.list(actingUserId(request), { vehicleId: query.vehicleId, deviceId: query.deviceId, favorite: query.favorite === undefined ? undefined : query.favorite === 'true', from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined }, query.page, query.limit);
    const pages = Math.ceil(result.total / query.limit);
    return reply.status(200).send({ data: result.items.map(tripSummary), pagination: { total: result.total, page: query.page, limit: query.limit, pages, hasNextPage: query.page < pages, hasPreviousPage: query.page > 1 } });
  });

  app.post<{ Body: unknown }>('/api/v1/trips', async (request, reply) => {
    const body = validate(request.body, CreateTripSchema) as { deviceId: string; startTime: string; endTime: string; vehicleId?: string | null; name?: string | null; favorite?: boolean };
    const trip = await mapTripInputError(reply, () => useCases.create(actingUserId(request), { ...body, startTime: new Date(body.startTime), endTime: new Date(body.endTime) }));
    return 'id' in trip ? reply.status(201).send({ trip: tripSummary(trip) }) : trip;
  });

  app.get<{ Params: { id: string } }>('/api/v1/trips/:id', async (request, reply) => {
    const result = await mapTripInputError(reply, () => useCases.detail(actingUserId(request), request.params.id));
    if (!('trip' in result)) return result;
    return reply.status(200).send({
      trip: tripSummary(result.trip), positions: result.positions.map((point) => ({ latitude: point.latitude, longitude: point.longitude, timestamp: point.timestamp.toISOString(), speed: point.speed, attributes: point.attributes ?? undefined })),
      stats: result.stats, stops: result.stops.map(stopDto), mergedGaps: result.mergedGaps.map((gap) => ({ gapAfter: gap.gapAfter.toISOString(), gapBefore: gap.gapBefore.toISOString() })),
      adjacentTrips: { previous: result.adjacentTrips.previous ? tripSummary(result.adjacentTrips.previous) : null, next: result.adjacentTrips.next ? tripSummary(result.adjacentTrips.next) : null },
    });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id', async (request, reply) => {
    const body = validate(request.body, UpdateTripSchema) as { name?: string | null; favorite?: boolean; startTime?: string; endTime?: string };
    const trip = await mapTripInputError(reply, () => useCases.update(actingUserId(request), request.params.id, { name: body.name, favorite: body.favorite, startTime: body.startTime ? new Date(body.startTime) : undefined, endTime: body.endTime ? new Date(body.endTime) : undefined }));
    return 'id' in trip ? reply.status(200).send({ trip: tripSummary(trip) }) : trip;
  });

  app.delete<{ Params: { id: string } }>('/api/v1/trips/:id', async (request, reply) => { await useCases.delete(actingUserId(request), request.params.id); return reply.status(204).send(); });
}
