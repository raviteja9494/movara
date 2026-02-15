import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { PrismaMaintenanceRepository } from '../persistence';
import { MaintenanceType } from '../../domain/entities';
import {
  validate,
  CreateMaintenanceSchema,
  UpdateMaintenanceSchema,
  PaginationQuerySchema,
} from '../../../../shared/validation';
import { getOffset, createPaginatedResponse } from '../../../../shared/utils';
import { getPrismaClient } from '../../../../infrastructure/db';
import { ValidationError, NotFoundError } from '../../../../shared/errors';
import {
  getMaintenanceUploadDir,
  uploadsDir,
  resolveSafePath,
  allowedReceiptExt,
} from '../../../../shared/uploads/uploads';

const maintenanceRepository = new PrismaMaintenanceRepository();

export async function registerMaintenanceRoutes(app: FastifyInstance) {
  app.get<{ Params: { vehicleId: string }; Querystring: unknown }>(
    '/api/v1/maintenance/:vehicleId',
    async (request) => {
      const { vehicleId } = request.params;

      if (!vehicleId) {
        throw new ValidationError([
          {
            code: 'custom',
            path: ['vehicleId'],
            message: 'vehicleId is required',
          } as any,
        ]);
      }

      // Validate and parse pagination params with defaults
      // Throws ValidationError on failure - caught by global error handler
      const paginationParams = validate(request.query, PaginationQuerySchema);

      // Get total count and paginated data
      const prisma = getPrismaClient();
      const total = await prisma.maintenanceRecord.count({
        where: { vehicleId },
      });
      const offset = getOffset(paginationParams.page ?? 1, paginationParams.limit ?? 10);

      const records = await prisma.maintenanceRecord.findMany({
        where: { vehicleId },
        orderBy: { date: 'desc' },
        skip: offset,
        take: paginationParams.limit ?? 10,
      });

      return createPaginatedResponse(
        records.map((r) => ({
          id: r.id,
          vehicleId: r.vehicleId,
          type: r.type,
          notes: r.notes,
          odometer: r.odometer,
          cost: r.cost,
          date: r.date,
          receiptPath: r.receiptPath,
          createdAt: r.createdAt,
        })),
        total,
        paginationParams.page ?? 1,
        paginationParams.limit ?? 10,
      );
    },
  );

  app.post<{ Body: unknown }>('/api/v1/maintenance', async (request, reply) => {
    // Validate request body using shared validation layer
    // Throws ValidationError on failure - caught by global error handler
    const validatedData = validate(request.body, CreateMaintenanceSchema);

    const { MaintenanceRecord } = await import('../../domain/entities');
    const record = MaintenanceRecord.create(
      validatedData.vehicleId,
      validatedData.type as MaintenanceType,
      new Date(validatedData.date),
      validatedData.notes ?? undefined,
      validatedData.odometer ?? undefined,
      validatedData.cost ?? undefined,
    );

    const created = await maintenanceRepository.createRecord(record);

    return reply.status(201).send({
      record: {
        id: created.id,
        vehicleId: created.vehicleId,
        type: created.type,
        notes: created.notes,
        odometer: created.odometer,
        cost: created.cost,
        date: created.date,
        receiptPath: created.receiptPath,
        createdAt: created.createdAt,
      },
    });
  });

  app.post<{ Params: { id: string } }>('/api/v1/maintenance/:id/receipt', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const record = await prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('MaintenanceRecord', id);
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }
    const ext = path.extname(data.filename) || '.pdf';
    if (!allowedReceiptExt(ext)) {
      return reply.status(400).send({ error: 'Allowed formats: jpg, jpeg, png, gif, webp, pdf' });
    }
    const dir = getMaintenanceUploadDir();
    const filename = `${id}${ext}`;
    const fullPath = path.join(dir, filename);
    await pipeline(data.file, fs.createWriteStream(fullPath));
    const relativePath = `maintenance/${filename}`;
    const updated = await maintenanceRepository.updateReceiptPath(id, relativePath);
    return reply.status(200).send({
      record: {
        id: updated!.id,
        vehicleId: updated!.vehicleId,
        type: updated!.type,
        notes: updated!.notes,
        odometer: updated!.odometer,
        cost: updated!.cost,
        date: updated!.date,
        receiptPath: updated!.receiptPath,
        createdAt: updated!.createdAt,
      },
    });
  });

  app.get<{ Params: { id: string } }>('/api/v1/maintenance/:id/receipt', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const record = await prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!record?.receiptPath) return reply.status(404).send();
    const fullPath = resolveSafePath(uploadsDir, record.receiptPath);
    if (!fullPath || !fs.existsSync(fullPath)) return reply.status(404).send();
    const ext = path.extname(record.receiptPath).toLowerCase();
    const contentType =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.gif'
            ? 'image/gif'
            : ext === '.webp'
              ? 'image/webp'
              : 'image/jpeg';
    return reply
      .type(contentType)
      .header('Content-Disposition', `inline; filename="receipt-${id}${ext}"`)
      .send(fs.createReadStream(fullPath));
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/maintenance/:id', async (request, reply) => {
    const { id } = request.params;
    const validatedData = validate(request.body, UpdateMaintenanceSchema);
    const updateData: Record<string, unknown> = {};
    if (validatedData.type !== undefined) updateData.type = validatedData.type;
    if (validatedData.date !== undefined) updateData.date = new Date(validatedData.date);
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes;
    if (validatedData.odometer !== undefined) updateData.odometer = validatedData.odometer;
    if (validatedData.cost !== undefined) updateData.cost = validatedData.cost;
    if (Object.keys(updateData).length === 0) {
      const prisma = getPrismaClient();
      const record = await prisma.maintenanceRecord.findUnique({ where: { id } });
      if (!record) throw new NotFoundError('MaintenanceRecord', id);
      return reply.status(200).send({
        record: {
          id: record.id,
          vehicleId: record.vehicleId,
          type: record.type,
          notes: record.notes,
          odometer: record.odometer,
          cost: record.cost,
          date: record.date,
          receiptPath: record.receiptPath,
          createdAt: record.createdAt,
        },
      });
    }
    const updated = await maintenanceRepository.updateRecord(id, updateData as any);
    if (!updated) throw new NotFoundError('MaintenanceRecord', id);
    return reply.status(200).send({
      record: {
        id: updated.id,
        vehicleId: updated.vehicleId,
        type: updated.type,
        notes: updated.notes,
        odometer: updated.odometer,
        cost: updated.cost,
        date: updated.date,
        receiptPath: updated.receiptPath,
        createdAt: updated.createdAt,
      },
    });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/maintenance/:id', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const record = await prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('MaintenanceRecord', id);
    await maintenanceRepository.delete(id);
    return reply.status(204).send();
  });
}
