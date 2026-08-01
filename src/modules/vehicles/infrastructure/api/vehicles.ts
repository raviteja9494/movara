import path from 'path';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import type { VehicleUseCases } from '../../application/use-cases';
import { allowedVehiclePhotoExt, uploadedFileMatchesExtensionAndMime } from '../../../../shared/uploads';
import { createPaginatedResponse } from '../../../../shared/utils';
import {
  CreateVehicleSchema,
  PaginationQuerySchema,
  UpdateVehicleSchema,
  validate,
  type UpdateVehicleRequest,
} from '../../../../shared/validation';
import { vehicleToDto } from './mappers';
import { actingUserId } from '../../../../shared/authorization';

const MAX_VEHICLE_PHOTO_BYTES = 1024 * 1024;

export async function registerVehicleCrudRoutes(app: FastifyInstance, useCases: VehicleUseCases) {
  app.get<{ Querystring: unknown }>('/api/v1/vehicles', async (request) => {
    const pagination = validate(request.query, PaginationQuerySchema) as { page: number; limit: number };
    const result = await useCases.list(actingUserId(request), pagination.page, pagination.limit);
    return createPaginatedResponse(result.items.map(vehicleToDto), result.total, pagination.page, pagination.limit);
  });

  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id', async (request, reply) =>
    reply.status(200).send({ vehicle: vehicleToDto(await useCases.get(actingUserId(request), request.params.id)) }));

  app.post<{ Body: unknown }>('/api/v1/vehicles', async (request, reply) => {
    const input = validate(request.body, CreateVehicleSchema);
    return reply.status(201).send({ vehicle: vehicleToDto(await useCases.create(actingUserId(request), input)) });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/vehicles/:id', async (request, reply) => {
    const input = validate(request.body, UpdateVehicleSchema as z.ZodType<UpdateVehicleRequest>);
    return reply.status(200).send({ vehicle: vehicleToDto(await useCases.update(actingUserId(request), request.params.id, input)) });
  });

  app.post<{ Params: { id: string } }>('/api/v1/vehicles/:id/photo', async (request, reply) => {
    const data = await request.file({ limits: { fileSize: MAX_VEHICLE_PHOTO_BYTES } });
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });
    const ext = path.extname(data.filename) || '.jpg';
    if (!allowedVehiclePhotoExt(ext)) return reply.status(400).send({ error: 'Allowed formats: jpg, jpeg, png, gif, webp' });
    const bytes = await data.toBuffer();
    if ((data.file as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
      return reply.status(413).send({ error: 'File too large. Maximum size is 1 MB. Use a smaller or compressed image.' });
    }
    if (!await uploadedFileMatchesExtensionAndMime(bytes, ext, data.mimetype)) {
      return reply.status(400).send({ error: 'File contents do not match the claimed image type' });
    }
    const normalized = ext.toLowerCase();
    const mimeType = normalized === '.png' ? 'image/png'
      : normalized === '.gif' ? 'image/gif'
        : normalized === '.webp' ? 'image/webp'
          : 'image/jpeg';
    const details = await useCases.savePhoto(actingUserId(request), request.params.id, {
      path: `vehicles/${request.params.id}${ext}`,
      data: bytes,
      mimeType,
      filename: data.filename,
    });
    return reply.status(200).send({ vehicle: vehicleToDto(details) });
  });

  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id/photo', async (request, reply) => {
    const photo = await useCases.getPhoto(actingUserId(request), request.params.id);
    return photo ? reply.type(photo.mimeType).send(photo.data) : reply.status(404).send();
  });

  app.delete<{ Params: { id: string } }>('/api/v1/vehicles/:id', async (request, reply) => {
    await useCases.delete(actingUserId(request), request.params.id);
    return reply.status(204).send();
  });
}
