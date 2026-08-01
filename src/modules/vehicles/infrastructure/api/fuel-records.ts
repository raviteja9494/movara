import type { FastifyInstance } from 'fastify';
import type { ZodSchema } from 'zod';
import type { FuelRecordInput, FuelRecordUseCases } from '../../application/use-cases';
import { CreateFuelRecordSchema, UpdateFuelRecordSchema, validate } from '../../../../shared/validation';
import { fuelRecordToDto } from './mappers';
import { actingUserId } from '../../../../shared/authorization';

export async function registerFuelRecordRoutes(app: FastifyInstance, useCases: FuelRecordUseCases) {
  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id/fuel-records', async (request, reply) => {
    const records = await useCases.list(actingUserId(request), request.params.id);
    return reply.status(200).send({ fuelRecords: records.map(fuelRecordToDto) });
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/vehicles/:id/fuel-records', async (request, reply) => {
    const input = validate(request.body, CreateFuelRecordSchema as unknown as ZodSchema<FuelRecordInput>);
    const record = await useCases.create(actingUserId(request), request.params.id, input);
    return reply.status(201).send({ fuelRecord: fuelRecordToDto(record) });
  });

  app.patch<{ Params: { id: string; recordId: string }; Body: unknown }>(
    '/api/v1/vehicles/:id/fuel-records/:recordId',
    async (request, reply) => {
      const input = validate(request.body, UpdateFuelRecordSchema as unknown as ZodSchema<Partial<FuelRecordInput>>);
      const record = await useCases.update(actingUserId(request), request.params.id, request.params.recordId, input);
      return reply.status(200).send({ fuelRecord: fuelRecordToDto(record) });
    },
  );

  app.delete<{ Params: { id: string; recordId: string } }>(
    '/api/v1/vehicles/:id/fuel-records/:recordId',
    async (request, reply) => {
      await useCases.delete(actingUserId(request), request.params.id, request.params.recordId);
      return reply.status(204).send();
    },
  );
}
