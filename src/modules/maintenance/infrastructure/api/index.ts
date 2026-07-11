import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import {
  validate,
  CreateMaintenanceSchema,
  UpdateMaintenanceSchema,
  CreateVehicleRecordSchema,
  UpdateVehicleRecordSchema,
  ListVehicleRecordsQuerySchema,
  PaginationQuerySchema,
} from '../../../../shared/validation';
import { getOffset, createPaginatedResponse } from '../../../../shared/utils';
import { getPrismaClient } from '../../../../infrastructure/db';
import { ValidationError, NotFoundError } from '../../../../shared/errors';
import {
  getVehicleRecordsUploadDir,
  uploadsDir,
  resolveSafePath,
  allowedReceiptExt,
} from '../../../../shared/uploads';

const MAINTENANCE_SUBTYPES = new Set(['service', 'repair', 'inspection', 'other']);
const MAX_RECORD_ATTACHMENT_BYTES = 1 * 1024 * 1024;

function defaultTitleForRecord(type: string, subtype: string | null | undefined): string {
  if (type === 'maintenance') {
    switch (subtype) {
      case 'service':
        return 'Service';
      case 'repair':
        return 'Repair';
      case 'inspection':
        return 'Inspection';
      default:
        return 'Maintenance record';
    }
  }
  if (type === 'document') {
    switch (subtype) {
      case 'insurance_third_party':
        return 'Third-party insurance';
      case 'insurance_own_damage':
        return 'Own damage insurance';
      case 'pollution_check':
        return 'Pollution check';
      case 'registration':
        return 'Registration';
      case 'permit':
        return 'Permit';
      case 'warranty':
        return 'Warranty';
      default:
        return 'Document';
    }
  }
  if (type === 'subscription') {
    return subtype === 'sim_recharge' ? 'SIM recharge' : 'Subscription';
  }
  if (type === 'accessory') {
    return subtype === 'tracker_purchase' ? 'Tracker purchase' : 'Accessory';
  }
  return 'Vehicle expense';
}

function toVehicleRecordDto(
  record: {
    id: string;
    vehicleId: string;
    type: string;
    subtype: string | null;
    title: string;
    notes: string | null;
    amount: number | null;
    odometer: number | null;
    date: Date;
    validFrom: Date | null;
    validUntil: Date | null;
    provider: string | null;
    referenceNumber: string | null;
    reminderMode: string;
    reminderDaysBefore: number | null;
    recurringIntervalDays: number | null;
    recurringIntervalKm: number | null;
    attachmentPath: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  vehicleName?: string | null,
) {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    vehicleName: vehicleName ?? null,
    type: record.type,
    subtype: record.subtype,
    title: record.title,
    notes: record.notes,
    amount: record.amount,
    odometer: record.odometer,
    date: record.date,
    validFrom: record.validFrom,
    validUntil: record.validUntil,
    provider: record.provider,
    referenceNumber: record.referenceNumber,
    reminderMode: record.reminderMode,
    reminderDaysBefore: record.reminderDaysBefore,
    recurringIntervalDays: record.recurringIntervalDays,
    recurringIntervalKm: record.recurringIntervalKm,
    attachmentPath: record.attachmentPath,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toMaintenanceDto(
  record: ReturnType<typeof toVehicleRecordDto>,
) {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    vehicleName: record.vehicleName,
    type: (record.subtype && MAINTENANCE_SUBTYPES.has(record.subtype)) ? record.subtype : 'other',
    notes: record.notes,
    odometer: record.odometer,
    cost: record.amount,
    date: record.date,
    receiptPath: record.attachmentPath,
    createdAt: record.createdAt,
  };
}

async function attachRecordFile(recordId: string, request: FastifyRequest, reply: FastifyReply) {
  const prisma = getPrismaClient();
  const record = await prisma.vehicleRecord.findUnique({ where: { id: recordId } });
  if (!record) throw new NotFoundError('VehicleRecord', recordId);
  const data = await request.file({ limits: { fileSize: MAX_RECORD_ATTACHMENT_BYTES } });
  if (!data) {
    return reply.status(400).send({ error: 'No file uploaded' });
  }
  const ext = path.extname(data.filename) || '.pdf';
  if (!allowedReceiptExt(ext)) {
    return reply.status(400).send({ error: 'Allowed formats: jpg, jpeg, png, gif, webp, pdf' });
  }
  const dir = getVehicleRecordsUploadDir();
  const filename = `${recordId}${ext}`;
  const fullPath = path.join(dir, filename);
  await pipeline(data.file, fs.createWriteStream(fullPath));
  if ((data.file as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      /* ignore */
    }
    return reply.status(413).send({
      error: 'File too large. Maximum size is 1 MB. Use a smaller or compressed file.',
    });
  }
  const relativePath = `vehicle-records/${filename}`;
  const updated = await prisma.vehicleRecord.update({
    where: { id: recordId },
    data: { attachmentPath: relativePath },
  });
  return reply.status(200).send({ record: toVehicleRecordDto(updated) });
}

export async function registerMaintenanceRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>('/api/v1/vehicle-records', async (request) => {
    const query = validate(request.query, ListVehicleRecordsQuerySchema);
    const prisma = getPrismaClient();
    const where: Record<string, unknown> = {};
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.type) where.type = query.type;
    const total = await prisma.vehicleRecord.count({ where });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = getOffset(page, limit);
    const records = await prisma.vehicleRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: offset,
      take: limit,
      include: { vehicle: { select: { name: true } } },
    });
    return createPaginatedResponse(
      records.map((record) => toVehicleRecordDto(record, record.vehicle?.name ?? null)),
      total,
      page,
      limit,
    );
  });

  app.post<{ Body: unknown }>('/api/v1/vehicle-records', async (request, reply) => {
    const data = validate(request.body, CreateVehicleRecordSchema);
    const prisma = getPrismaClient();
    const created = await prisma.vehicleRecord.create({
      data: {
        id: crypto.randomUUID(),
        vehicleId: data.vehicleId,
        type: data.type,
        subtype: data.subtype ?? null,
        title: data.title,
        notes: data.notes ?? null,
        amount: data.amount ?? null,
        odometer: data.odometer ?? null,
        date: new Date(data.date),
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        provider: data.provider ?? null,
        referenceNumber: data.referenceNumber ?? null,
        reminderMode: data.reminderMode,
        reminderDaysBefore: data.reminderDaysBefore ?? null,
        recurringIntervalDays: data.recurringIntervalDays ?? null,
        recurringIntervalKm: data.recurringIntervalKm ?? null,
      },
    });
    return reply.status(201).send({ record: toVehicleRecordDto(created) });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/vehicle-records/:id', async (request, reply) => {
    const { id } = request.params;
    const data = validate(request.body, UpdateVehicleRecordSchema);
    const prisma = getPrismaClient();
    const existing = await prisma.vehicleRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('VehicleRecord', id);
    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.subtype !== undefined) updateData.subtype = data.subtype;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.odometer !== undefined) updateData.odometer = data.odometer;
    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (data.validFrom !== undefined) updateData.validFrom = data.validFrom ? new Date(data.validFrom) : null;
    if (data.validUntil !== undefined) updateData.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.referenceNumber !== undefined) updateData.referenceNumber = data.referenceNumber;
    if (data.reminderMode !== undefined) updateData.reminderMode = data.reminderMode;
    if (data.reminderDaysBefore !== undefined) updateData.reminderDaysBefore = data.reminderDaysBefore;
    if (data.recurringIntervalDays !== undefined) updateData.recurringIntervalDays = data.recurringIntervalDays;
    if (data.recurringIntervalKm !== undefined) updateData.recurringIntervalKm = data.recurringIntervalKm;
    const updated = Object.keys(updateData).length === 0
      ? existing
      : await prisma.vehicleRecord.update({ where: { id }, data: updateData });
    return reply.status(200).send({ record: toVehicleRecordDto(updated) });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/vehicle-records/:id', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const existing = await prisma.vehicleRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('VehicleRecord', id);
    await prisma.vehicleRecord.delete({ where: { id } });
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/v1/vehicle-records/:id/attachment', async (request, reply) => {
    return attachRecordFile(request.params.id, request, reply);
  });

  app.get<{ Params: { id: string } }>('/api/v1/vehicle-records/:id/attachment', async (request, reply) => {
    const prisma = getPrismaClient();
    const record = await prisma.vehicleRecord.findUnique({ where: { id: request.params.id } });
    if (!record?.attachmentPath) return reply.status(404).send();
    const fullPath = resolveSafePath(uploadsDir, record.attachmentPath);
    if (!fullPath || !fs.existsSync(fullPath)) return reply.status(404).send();
    const ext = path.extname(record.attachmentPath).toLowerCase();
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
      .header('Content-Disposition', `inline; filename="record-${request.params.id}${ext}"`)
      .send(fs.createReadStream(fullPath));
  });

  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/api/v1/maintenance',
    async (request) => {
      const query = validate(request.query, PaginationQuerySchema);
      const prisma = getPrismaClient();
      const where = { type: 'maintenance' };
      const total = await prisma.vehicleRecord.count({ where });
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = getOffset(page, limit);
      const records = await prisma.vehicleRecord.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: offset,
        take: limit,
        include: { vehicle: { select: { name: true } } },
      });
      return createPaginatedResponse(
        records.map((record) => toMaintenanceDto(toVehicleRecordDto(record, record.vehicle?.name ?? null))),
        total,
        page,
        limit,
      );
    },
  );

  app.post<{ Params: { id: string } }>('/api/v1/maintenance/:id/receipt', async (request, reply) => {
    return attachRecordFile(request.params.id, request, reply);
  });

  app.get<{ Params: { id: string } }>('/api/v1/maintenance/:id/receipt', async (request, reply) => {
    const prisma = getPrismaClient();
    const record = await prisma.vehicleRecord.findUnique({ where: { id: request.params.id } });
    if (!record?.attachmentPath) return reply.status(404).send();
    const fullPath = resolveSafePath(uploadsDir, record.attachmentPath);
    if (!fullPath || !fs.existsSync(fullPath)) return reply.status(404).send();
    const ext = path.extname(record.attachmentPath).toLowerCase();
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
      .header('Content-Disposition', `inline; filename="receipt-${request.params.id}${ext}"`)
      .send(fs.createReadStream(fullPath));
  });

  app.get<{ Params: { vehicleId: string }; Querystring: unknown }>(
    '/api/v1/maintenance/:vehicleId',
    async (request) => {
      const { vehicleId } = request.params;
      if (!vehicleId) {
        throw new ValidationError([
          { code: 'custom', path: ['vehicleId'], message: 'vehicleId is required' } as never,
        ]);
      }
      const query = validate(request.query, PaginationQuerySchema);
      const prisma = getPrismaClient();
      const where = { vehicleId, type: 'maintenance' };
      const total = await prisma.vehicleRecord.count({ where });
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = getOffset(page, limit);
      const records = await prisma.vehicleRecord.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: offset,
        take: limit,
      });
      return createPaginatedResponse(
        records.map((record) => toMaintenanceDto(toVehicleRecordDto(record))),
        total,
        page,
        limit,
      );
    },
  );

  app.post<{ Body: unknown }>('/api/v1/maintenance', async (request, reply) => {
    const data = validate(request.body, CreateMaintenanceSchema);
    const prisma = getPrismaClient();
    const created = await prisma.vehicleRecord.create({
      data: {
        id: crypto.randomUUID(),
        vehicleId: data.vehicleId,
        type: 'maintenance',
        subtype: data.type,
        title: defaultTitleForRecord('maintenance', data.type),
        notes: data.notes ?? null,
        amount: data.cost ?? null,
        odometer: data.odometer ?? null,
        date: new Date(data.date),
      },
    });
    return reply.status(201).send({ record: toMaintenanceDto(toVehicleRecordDto(created)) });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/maintenance/:id', async (request, reply) => {
    const { id } = request.params;
    const data = validate(request.body, UpdateMaintenanceSchema);
    const prisma = getPrismaClient();
    const existing = await prisma.vehicleRecord.findUnique({ where: { id } });
    if (!existing || existing.type !== 'maintenance') throw new NotFoundError('MaintenanceRecord', id);
    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) {
      updateData.subtype = data.type;
      updateData.title = defaultTitleForRecord('maintenance', data.type);
    }
    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.odometer !== undefined) updateData.odometer = data.odometer;
    if (data.cost !== undefined) updateData.amount = data.cost;
    const updated = Object.keys(updateData).length === 0
      ? existing
      : await prisma.vehicleRecord.update({ where: { id }, data: updateData });
    return reply.status(200).send({ record: toMaintenanceDto(toVehicleRecordDto(updated)) });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/maintenance/:id', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const existing = await prisma.vehicleRecord.findUnique({ where: { id } });
    if (!existing || existing.type !== 'maintenance') throw new NotFoundError('MaintenanceRecord', id);
    await prisma.vehicleRecord.delete({ where: { id } });
    return reply.status(204).send();
  });
}
