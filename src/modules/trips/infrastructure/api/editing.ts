import type { FastifyInstance } from 'fastify';
import type { TripUseCases } from '../../application/use-cases';
import { CreateTripStopSchema, MergeTripsSchema, SplitTripSchema, UpdateTripStopSchema, validate, type CreateTripStopRequest, type MergeTripsRequest, type SplitTripRequest, type UpdateTripStopRequest } from '../../../../shared/validation';
import { mapTripInputError } from './helpers';
import { actingUserId } from '../../../../shared/authorization';
import { stopDto, tripSummary } from './mappers';

export async function registerTripEditingRoutes(app: FastifyInstance, useCases: TripUseCases) {
  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id/stops', async (request, reply) => {
    const body = validate(request.body, CreateTripStopSchema) as CreateTripStopRequest;
    const stop = await mapTripInputError(reply, () => useCases.createStop(actingUserId(request), request.params.id, { ...body, startTime: new Date(body.startTime), endTime: body.endTime ? new Date(body.endTime) : null }));
    return 'tripId' in stop ? reply.status(201).send({ stop: stopDto(stop) }) : stop;
  });

  app.patch<{ Params: { id: string; stopId: string }; Body: unknown }>('/api/v1/trips/:id/stops/:stopId', async (request, reply) => {
    const body = validate(request.body, UpdateTripStopSchema) as UpdateTripStopRequest;
    const stop = await mapTripInputError(reply, () => useCases.updateStop(actingUserId(request), request.params.id, request.params.stopId, { label: body.label, endTime: body.endTime === undefined ? undefined : body.endTime === null || body.endTime === '' ? null : new Date(body.endTime) }));
    return 'tripId' in stop ? reply.status(200).send({ stop: stopDto(stop) }) : stop;
  });

  app.delete<{ Params: { id: string; stopId: string } }>('/api/v1/trips/:id/stops/:stopId', async (request, reply) => { await useCases.deleteStop(actingUserId(request), request.params.id, request.params.stopId); return reply.status(204).send(); });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id/split', async (request, reply) => {
    const body = validate(request.body, SplitTripSchema) as SplitTripRequest;
    const trips = await mapTripInputError(reply, () => useCases.split(actingUserId(request), request.params.id, new Date(body.splitAt)));
    return Array.isArray(trips) ? reply.status(201).send({ trips: trips.map((trip) => ({ id: trip.id, startTime: trip.startTime.toISOString(), endTime: trip.endTime.toISOString(), name: trip.name })) }) : trips;
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id/merge', async (request, reply) => {
    const body = validate(request.body, MergeTripsSchema) as MergeTripsRequest;
    const result = await mapTripInputError(reply, () => useCases.merge(actingUserId(request), request.params.id, body.targetTripId));
    return 'deletedTripIds' in result ? reply.status(201).send({ trip: tripSummary(result.trip), mergedTripId: result.trip.id, deletedTripIds: result.deletedTripIds }) : result;
  });
}
