import path from 'path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MaintenanceUseCases } from '../../application/use-cases';
import type { MaintenanceType, VehicleRecordProps } from '../../domain/entities';
import type { VehicleRecordUpdate } from '../../domain/repositories';
import {
  CreateMaintenanceSchema, CreateVehicleRecordSchema, ListVehicleRecordsQuerySchema,
  PaginationQuerySchema, UpdateMaintenanceSchema, UpdateVehicleRecordSchema, validate,
} from '../../../../shared/validation';
import { createPaginatedResponse } from '../../../../shared/utils';
import { ValidationError } from '../../../../shared/errors';
import { allowedReceiptExt } from '../../../../shared/uploads';
import { toMaintenanceDto, toVehicleRecordDto } from './mappers';
import { actingUserId } from '../../../../shared/authorization';

const MAX_RECORD_ATTACHMENT_BYTES = 1024 * 1024;

async function uploadAttachment(useCases: MaintenanceUseCases, recordId: string, request: FastifyRequest, reply: FastifyReply) {
  const data = await request.file({ limits: { fileSize: MAX_RECORD_ATTACHMENT_BYTES } });
  if (!data) return reply.status(400).send({ error: 'No file uploaded' });
  const ext = path.extname(data.filename) || '.pdf';
  if (!allowedReceiptExt(ext)) return reply.status(400).send({ error: 'Allowed formats: jpg, jpeg, png, gif, webp, pdf' });
  const bytes = await data.toBuffer();
  if ((data.file as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
    return reply.status(413).send({ error: 'File too large. Maximum size is 1 MB. Use a smaller or compressed file.' });
  }
  const record = await useCases.saveAttachment(actingUserId(request), recordId, {
    path: `vehicle-records/${recordId}${ext}`, data: bytes,
    mimeType: data.mimetype || 'application/octet-stream', filename: data.filename,
  });
  return reply.status(200).send({ record: toVehicleRecordDto(record) });
}

async function downloadAttachment(useCases: MaintenanceUseCases, recordId: string, prefix: string, request: FastifyRequest, reply: FastifyReply) {
  const attachment = await useCases.getAttachment(actingUserId(request), recordId);
  if (!attachment) return reply.status(404).send();
  const ext = path.extname(attachment.path);
  return reply.type(attachment.mimeType).header('Content-Disposition', `inline; filename="${prefix}-${recordId}${ext}"`).send(attachment.data);
}

export async function registerMaintenanceRoutes(app: FastifyInstance, useCases: MaintenanceUseCases) {
  app.get<{ Querystring: unknown }>('/api/v1/vehicle-records', async (request) => {
    const query = validate(request.query, ListVehicleRecordsQuerySchema) as { vehicleId?: string; type?: string; page: number; limit: number };
    const result = await useCases.list(actingUserId(request), { vehicleId: query.vehicleId, type: query.type }, query.page, query.limit);
    return createPaginatedResponse(result.items.map(toVehicleRecordDto), result.total, query.page, query.limit);
  });

  app.post<{ Body: unknown }>('/api/v1/vehicle-records', async (request, reply) => {
    const input = validate(request.body, CreateVehicleRecordSchema);
    const record = await useCases.create(actingUserId(request), { ...input, date: new Date(input.date), validFrom: input.validFrom ? new Date(input.validFrom) : null, validUntil: input.validUntil ? new Date(input.validUntil) : null } as Omit<VehicleRecordProps, 'userId'>);
    return reply.status(201).send({ record: toVehicleRecordDto(record) });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/vehicle-records/:id', async (request, reply) => {
    const input = validate(request.body, UpdateVehicleRecordSchema);
    const update = { ...input } as Record<string, unknown>;
    if (input.date !== undefined) update.date = new Date(input.date);
    if (input.validFrom !== undefined) update.validFrom = input.validFrom ? new Date(input.validFrom) : null;
    if (input.validUntil !== undefined) update.validUntil = input.validUntil ? new Date(input.validUntil) : null;
    return reply.status(200).send({ record: toVehicleRecordDto(await useCases.update(actingUserId(request), request.params.id, update as VehicleRecordUpdate)) });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/vehicle-records/:id', async (request, reply) => {
    await useCases.delete(actingUserId(request), request.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/v1/vehicle-records/:id/attachment', (request, reply) => uploadAttachment(useCases, request.params.id, request, reply));
  app.get<{ Params: { id: string } }>('/api/v1/vehicle-records/:id/attachment', (request, reply) => downloadAttachment(useCases, request.params.id, 'record', request, reply));

  app.get<{ Querystring: unknown }>('/api/v1/maintenance', async (request) => {
    const query = validate(request.query, PaginationQuerySchema) as { page: number; limit: number };
    const result = await useCases.listMaintenance(actingUserId(request), undefined, query.page, query.limit);
    return createPaginatedResponse(result.items.map(toMaintenanceDto), result.total, query.page, query.limit);
  });

  app.get<{ Params: { vehicleId: string }; Querystring: unknown }>('/api/v1/maintenance/:vehicleId', async (request) => {
    if (!request.params.vehicleId) throw new ValidationError([{ code: 'custom', path: ['vehicleId'], message: 'vehicleId is required' } as never]);
    const query = validate(request.query, PaginationQuerySchema) as { page: number; limit: number };
    const result = await useCases.listMaintenance(actingUserId(request), request.params.vehicleId, query.page, query.limit);
    return createPaginatedResponse(result.items.map(toMaintenanceDto), result.total, query.page, query.limit);
  });

  app.post<{ Body: unknown }>('/api/v1/maintenance', async (request, reply) => {
    const input = validate(request.body, CreateMaintenanceSchema);
    const record = await useCases.createMaintenance(actingUserId(request), { ...input, type: input.type as MaintenanceType, date: new Date(input.date) });
    return reply.status(201).send({ record: toMaintenanceDto(record) });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/maintenance/:id', async (request, reply) => {
    const input = validate(request.body, UpdateMaintenanceSchema);
    const record = await useCases.updateMaintenance(actingUserId(request), request.params.id, { ...input, type: input.type as MaintenanceType | undefined, date: input.date ? new Date(input.date) : undefined });
    return reply.status(200).send({ record: toMaintenanceDto(record) });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/maintenance/:id', async (request, reply) => {
    await useCases.deleteMaintenance(actingUserId(request), request.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/v1/maintenance/:id/receipt', (request, reply) => uploadAttachment(useCases, request.params.id, request, reply));
  app.get<{ Params: { id: string } }>('/api/v1/maintenance/:id/receipt', (request, reply) => downloadAttachment(useCases, request.params.id, 'receipt', request, reply));
}
