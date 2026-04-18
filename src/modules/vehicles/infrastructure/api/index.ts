import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { PrismaVehicleRepository, PrismaFuelRecordRepository } from '../persistence';
import type { z } from 'zod';
import {
  validate,
  CreateVehicleSchema,
  UpdateVehicleSchema,
  CreateFuelRecordSchema,
  UpdateFuelRecordSchema,
  CreateTripMergeSchema,
  PaginationQuerySchema,
  type UpdateVehicleRequest,
} from '../../../../shared/validation';
import { getOffset, createPaginatedResponse } from '../../../../shared/utils';
import { getPrismaClient } from '../../../../infrastructure/db';
import { FuelRecord } from '../../domain/entities';
import { NotFoundError } from '../../../../shared/errors';
import { haversineKm } from '../../../../shared/utils';
import {
  getVehiclesUploadDir,
  uploadsDir,
  resolveSafePath,
  allowedVehiclePhotoExt,
} from '../../../../shared/uploads';
import { refreshVehicleEstimatedOdometer } from '../estimatedOdometer';

const vehicleRepository = new PrismaVehicleRepository();
const fuelRecordRepository = new PrismaFuelRecordRepository();

function vehicleToDto(v: {
  id: string;
  name: string;
  description: string | null;
  licensePlate: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  currentOdometer: number | null;
  estimatedOdometerKm: number | null;
  estimatedOdometerBaseAt: Date | null;
  fuelType: string | null;
  icon: string | null;
  photoPath: string | null;
  deviceId: string | null;
  createdAt: Date;
  records?: Array<{
    subtype: string | null;
    validFrom: Date | null;
    validUntil: Date | null;
    provider: string | null;
    referenceNumber: string | null;
  }>;
}) {
  const thirdParty = v.records?.find((record) => record.subtype === 'insurance_third_party') ?? null;
  const ownDamage = v.records?.find((record) => record.subtype === 'insurance_own_damage') ?? null;
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    licensePlate: v.licensePlate,
    vin: v.vin,
    year: v.year,
    make: v.make,
    model: v.model,
    currentOdometer: v.currentOdometer,
    estimatedOdometerKm: v.estimatedOdometerKm,
    estimatedOdometerCalibratedAt: v.estimatedOdometerBaseAt?.toISOString() ?? null,
    fuelType: v.fuelType,
    icon: v.icon,
    photoPath: v.photoPath,
    deviceId: v.deviceId,
    createdAt: v.createdAt,
    thirdPartyInsuranceStart: thirdParty?.validFrom?.toISOString() ?? null,
    thirdPartyInsuranceEnd: thirdParty?.validUntil?.toISOString() ?? null,
    thirdPartyInsuranceProvider: thirdParty?.provider ?? null,
    thirdPartyInsuranceNumber: thirdParty?.referenceNumber ?? null,
    ownInsuranceStart: ownDamage?.validFrom?.toISOString() ?? null,
    ownInsuranceEnd: ownDamage?.validUntil?.toISOString() ?? null,
    ownInsuranceProvider: ownDamage?.provider ?? null,
    ownInsuranceNumber: ownDamage?.referenceNumber ?? null,
  };
}

async function syncInsuranceRecords(
  vehicleId: string,
  data: Partial<UpdateVehicleRequest>,
): Promise<void> {
  const prisma = getPrismaClient();
  const syncOne = async (
    subtype: 'insurance_third_party' | 'insurance_own_damage',
    title: string,
    payload: {
      start?: Date | null;
      end?: Date | null;
      provider?: string | null;
      number?: string | null;
    },
  ) => {
    const existing = await prisma.vehicleRecord.findFirst({
      where: { vehicleId, type: 'document', subtype },
    });
    const validFrom = payload.start ?? existing?.validFrom ?? null;
    const validUntil = payload.end ?? existing?.validUntil ?? null;
    const provider = payload.provider ?? existing?.provider ?? null;
    const referenceNumber = payload.number ?? existing?.referenceNumber ?? null;
    const hasAnyValue = Boolean(validFrom || validUntil || provider || referenceNumber);
    if (!hasAnyValue) {
      if (existing) {
        await prisma.vehicleRecord.delete({ where: { id: existing.id } });
      }
      return;
    }
    const updateData = {
      title,
      validFrom,
      validUntil,
      provider,
      referenceNumber,
      date: validFrom ?? validUntil ?? existing?.date ?? new Date(),
      reminderMode: validUntil ? 'on_date' : 'none',
      reminderDaysBefore: validUntil ? 30 : null,
    };
    if (existing) {
      await prisma.vehicleRecord.update({
        where: { id: existing.id },
        data: updateData,
      });
      return;
    }
    await prisma.vehicleRecord.create({
      data: {
        id: crypto.randomUUID(),
        vehicleId,
        type: 'document',
        subtype,
        ...updateData,
      },
    });
  };

  await syncOne('insurance_third_party', 'Third-party insurance', {
    start: data.thirdPartyInsuranceStart,
    end: data.thirdPartyInsuranceEnd,
    provider: data.thirdPartyInsuranceProvider,
    number: data.thirdPartyInsuranceNumber,
  });
  await syncOne('insurance_own_damage', 'Own damage insurance', {
    start: data.ownInsuranceStart,
    end: data.ownInsuranceEnd,
    provider: data.ownInsuranceProvider,
    number: data.ownInsuranceNumber,
  });
}

function applyOdometerCalibration<T extends { currentOdometer?: number | null }>(
  data: T,
): T & {
  estimatedOdometerKm?: number | null;
  estimatedOdometerBaseKm?: number | null;
  estimatedOdometerBaseAt?: Date | null;
  estimatedOdometerUpdatedAt?: Date | null;
} {
  if (typeof data.currentOdometer !== 'number') return data;
  const now = new Date();
  return {
    ...data,
    estimatedOdometerKm: data.currentOdometer,
    estimatedOdometerBaseKm: data.currentOdometer,
    estimatedOdometerBaseAt: now,
    estimatedOdometerUpdatedAt: now,
  };
}

export async function registerVehicleRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>('/api/v1/vehicles', async (request) => {
    const paginationParams = validate(request.query, PaginationQuerySchema) as {
      page: number;
      limit: number;
    };
    const prisma = getPrismaClient();
    const total = await prisma.vehicle.count();
    const offset = getOffset(paginationParams.page, paginationParams.limit);

    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: paginationParams.limit,
      include: {
        records: {
          where: {
            type: 'document',
            subtype: { in: ['insurance_third_party', 'insurance_own_damage'] },
          },
          select: {
            subtype: true,
            validFrom: true,
            validUntil: true,
            provider: true,
            referenceNumber: true,
          },
        },
      },
    });

    const withEstimates = await Promise.all(
      vehicles.map((vehicle) => refreshVehicleEstimatedOdometer(vehicle)),
    );

    return createPaginatedResponse(
      withEstimates.map(vehicleToDto),
      total,
      paginationParams.page,
      paginationParams.limit,
    );
  });

  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        records: {
          where: {
            type: 'document',
            subtype: { in: ['insurance_third_party', 'insurance_own_damage'] },
          },
          select: {
            subtype: true,
            validFrom: true,
            validUntil: true,
            provider: true,
            referenceNumber: true,
          },
        },
      },
    });
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    const withEstimate = await refreshVehicleEstimatedOdometer(vehicle);
    return reply.status(200).send({ vehicle: vehicleToDto(withEstimate) });
  });

  app.post<{ Body: unknown }>('/api/v1/vehicles', async (request, reply) => {
    const validatedData = validate(request.body, CreateVehicleSchema) as {
      name: string;
      description?: string | null;
      licensePlate?: string | null;
      vin?: string | null;
      year?: number | null;
      make?: string | null;
      model?: string | null;
      currentOdometer?: number | null;
      fuelType?: string | null;
      icon?: string | null;
      deviceId?: string | null;
    };
    const { Vehicle } = await import('../../domain/entities');
    const vehicle = Vehicle.create(applyOdometerCalibration(validatedData));
    const created = await vehicleRepository.createVehicle(vehicle);
    const prisma = getPrismaClient();
    const hydrated = await prisma.vehicle.findUnique({
      where: { id: created.id },
      include: {
        records: {
          where: {
            type: 'document',
            subtype: { in: ['insurance_third_party', 'insurance_own_damage'] },
          },
          select: {
            subtype: true,
            validFrom: true,
            validUntil: true,
            provider: true,
            referenceNumber: true,
          },
        },
      },
    });
    return reply.status(201).send({
      vehicle: vehicleToDto(await refreshVehicleEstimatedOdometer(hydrated ?? {
        id: created.id,
        name: created.name,
        description: created.description,
        licensePlate: created.licensePlate,
        vin: created.vin,
        year: created.year,
        make: created.make,
        model: created.model,
        currentOdometer: created.currentOdometer,
        estimatedOdometerKm: created.estimatedOdometerKm,
        estimatedOdometerBaseKm: created.estimatedOdometerBaseKm,
        estimatedOdometerBaseAt: created.estimatedOdometerBaseAt,
        estimatedOdometerUpdatedAt: created.estimatedOdometerUpdatedAt,
        fuelType: created.fuelType,
        icon: created.icon,
        photoPath: created.photoPath,
        deviceId: created.deviceId,
        createdAt: created.createdAt,
        records: [],
      })),
    });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/v1/vehicles/:id',
    async (request, reply) => {
      const { id } = request.params;
      const existing = await vehicleRepository.findVehicleById(id);
      if (!existing) throw new NotFoundError('Vehicle', id);
      const data = validate(
        request.body,
        UpdateVehicleSchema as z.ZodType<UpdateVehicleRequest>,
      );
      const updated = await vehicleRepository.updateVehicle(id, applyOdometerCalibration(data));
      await syncInsuranceRecords(id, data);
      const prisma = getPrismaClient();
      const hydrated = await prisma.vehicle.findUnique({
        where: { id },
        include: {
          records: {
            where: {
              type: 'document',
              subtype: { in: ['insurance_third_party', 'insurance_own_damage'] },
            },
            select: {
              subtype: true,
              validFrom: true,
              validUntil: true,
              provider: true,
              referenceNumber: true,
            },
          },
        },
      });
      const u = await refreshVehicleEstimatedOdometer(hydrated ?? updated!);
      return reply.status(200).send({
        vehicle: vehicleToDto(u),
      });
    },
  );

  app.post<{ Params: { id: string } }>('/api/v1/vehicles/:id/photo', async (request, reply) => {
    const { id } = request.params;
    const vehicle = await vehicleRepository.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }
    const ext = path.extname(data.filename) || '.jpg';
    if (!allowedVehiclePhotoExt(ext)) {
      return reply.status(400).send({ error: 'Allowed formats: jpg, jpeg, png, gif, webp' });
    }
    const dir = getVehiclesUploadDir();
    const filename = `${id}${ext}`;
    const fullPath = path.join(dir, filename);
    await pipeline(data.file, fs.createWriteStream(fullPath));
    if ((data.file as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        /* ignore */
      }
      return reply.status(413).send({
        error: 'File too large. Maximum size is 1 MB. Use a smaller or compressed image.',
      });
    }
    const relativePath = `vehicles/${filename}`;
    await vehicleRepository.updateVehicle(id, { photoPath: relativePath });
    const prisma = getPrismaClient();
    const updated = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        records: {
          where: {
            type: 'document',
            subtype: { in: ['insurance_third_party', 'insurance_own_damage'] },
          },
          select: {
            subtype: true,
            validFrom: true,
            validUntil: true,
            provider: true,
            referenceNumber: true,
          },
        },
      },
    });
    return reply.status(200).send({
      vehicle: vehicleToDto(updated!),
    });
  });

  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id/photo', async (request, reply) => {
    const { id } = request.params;
    const vehicle = await vehicleRepository.findVehicleById(id);
    if (!vehicle?.photoPath) return reply.status(404).send();
    const fullPath = resolveSafePath(uploadsDir, vehicle.photoPath);
    if (!fullPath || !fs.existsSync(fullPath)) return reply.status(404).send();
    const ext = path.extname(vehicle.photoPath).toLowerCase();
    const contentType =
      ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return reply.type(contentType).send(fs.createReadStream(fullPath));
  });

  app.delete<{ Params: { id: string } }>('/api/v1/vehicles/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = await vehicleRepository.findVehicleById(id);
    if (!existing) throw new NotFoundError('Vehicle', id);
    await vehicleRepository.delete(id);
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id/fuel-records', async (request, reply) => {
    const { id } = request.params;
    const vehicle = await vehicleRepository.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    const records = await fuelRecordRepository.findByVehicleId(id);
    return reply.status(200).send({
      fuelRecords: records.map((r) => ({
        id: r.id,
        vehicleId: r.vehicleId,
        date: r.date,
        odometer: r.odometer,
        fuelQuantity: r.fuelQuantity,
        fuelCost: r.fuelCost,
        fuelRate: r.fuelRate,
        latitude: r.latitude,
        longitude: r.longitude,
        createdAt: r.createdAt,
      })),
    });
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/v1/vehicles/:id/fuel-records',
    async (request, reply) => {
      const { id: vehicleId } = request.params;
      const vehicle = await vehicleRepository.findVehicleById(vehicleId);
      if (!vehicle) throw new NotFoundError('Vehicle', vehicleId);

      const parsed = validate(request.body, CreateFuelRecordSchema as unknown as import('zod').ZodSchema<{
        date: Date;
        odometer: number;
        fuelQuantity: number;
        fuelCost?: number | null;
        fuelRate?: number | null;
      }>) as {
        date: Date;
        odometer: number;
        fuelQuantity: number;
        fuelCost?: number | null;
        fuelRate?: number | null;
      };

      let latitude: number | null = null;
      let longitude: number | null = null;
      if (vehicle.deviceId) {
        const prisma = getPrismaClient();
        const position = await prisma.position.findFirst({
          where: {
            deviceId: vehicle.deviceId,
            timestamp: { lte: parsed.date },
          },
          orderBy: { timestamp: 'desc' },
        });
        if (position) {
          latitude = position.latitude;
          longitude = position.longitude;
        }
      }

      const record = FuelRecord.create({
        vehicleId,
        date: parsed.date,
        odometer: parsed.odometer,
        fuelQuantity: parsed.fuelQuantity,
        fuelCost: parsed.fuelCost,
        fuelRate: parsed.fuelRate,
        latitude,
        longitude,
      });
      const created = await fuelRecordRepository.create(record);

      return reply.status(201).send({
        fuelRecord: {
          id: created.id,
          vehicleId: created.vehicleId,
          date: created.date,
          odometer: created.odometer,
          fuelQuantity: created.fuelQuantity,
          fuelCost: created.fuelCost,
          fuelRate: created.fuelRate,
          latitude: created.latitude,
          longitude: created.longitude,
          createdAt: created.createdAt,
        },
      });
    },
  );

  app.patch<{ Params: { id: string; recordId: string }; Body: unknown }>(
    '/api/v1/vehicles/:id/fuel-records/:recordId',
    async (request, reply) => {
      const { id: vehicleId, recordId } = request.params;
      const vehicle = await vehicleRepository.findVehicleById(vehicleId);
      if (!vehicle) throw new NotFoundError('Vehicle', vehicleId);
      const prisma = getPrismaClient();
      const existing = await prisma.fuelRecord.findFirst({
        where: { id: recordId, vehicleId },
      });
      if (!existing) throw new NotFoundError('FuelRecord', recordId);

      const parsed = validate(request.body, UpdateFuelRecordSchema as unknown as import('zod').ZodSchema<{
        date?: Date;
        odometer?: number;
        fuelQuantity?: number;
        fuelCost?: number | null;
        fuelRate?: number | null;
      }>) as {
        date?: Date;
        odometer?: number;
        fuelQuantity?: number;
        fuelCost?: number | null;
        fuelRate?: number | null;
      };
      const updateData: Record<string, unknown> = {};
      if (parsed.date !== undefined) updateData.date = parsed.date;
      if (parsed.odometer !== undefined) updateData.odometer = parsed.odometer;
      if (parsed.fuelQuantity !== undefined) updateData.fuelQuantity = parsed.fuelQuantity;
      if (parsed.fuelCost !== undefined) updateData.fuelCost = parsed.fuelCost;
      if (parsed.fuelRate !== undefined) updateData.fuelRate = parsed.fuelRate;
      if (Object.keys(updateData).length === 0) {
        return reply.status(200).send({
          fuelRecord: {
            id: existing.id,
            vehicleId: existing.vehicleId,
            date: existing.date,
            odometer: existing.odometer,
            fuelQuantity: existing.fuelQuantity,
            fuelCost: existing.fuelCost,
            fuelRate: existing.fuelRate,
            latitude: existing.latitude,
            longitude: existing.longitude,
            createdAt: existing.createdAt,
          },
        });
      }

      const updated = await fuelRecordRepository.update(recordId, updateData as any);
      if (!updated) throw new NotFoundError('FuelRecord', recordId);
      return reply.status(200).send({
        fuelRecord: {
          id: updated.id,
          vehicleId: updated.vehicleId,
          date: updated.date,
          odometer: updated.odometer,
          fuelQuantity: updated.fuelQuantity,
          fuelCost: updated.fuelCost,
          fuelRate: updated.fuelRate,
          latitude: updated.latitude,
          longitude: updated.longitude,
          createdAt: updated.createdAt,
        },
      });
    },
  );

  app.delete<{ Params: { id: string; recordId: string } }>(
    '/api/v1/vehicles/:id/fuel-records/:recordId',
    async (request, reply) => {
      const { id: vehicleId, recordId } = request.params;
      const vehicle = await vehicleRepository.findVehicleById(vehicleId);
      if (!vehicle) throw new NotFoundError('Vehicle', vehicleId);
      const prisma = getPrismaClient();
      const record = await prisma.fuelRecord.findFirst({
        where: { id: recordId, vehicleId },
      });
      if (!record) throw new NotFoundError('FuelRecord', recordId);
      await fuelRecordRepository.delete(recordId);
      return reply.status(204).send();
    },
  );

  const TRIP_GAP_MS = 30 * 60 * 1000; // 30 min gap = new trip
  const TRIP_MERGE_TOLERANCE_MS = 2000; // match gap boundaries within 2s

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/api/v1/vehicles/:id/trips',
    async (request, reply) => {
      const { id } = request.params;
      const vehicle = await vehicleRepository.findVehicleById(id);
      if (!vehicle) throw new NotFoundError('Vehicle', id);
      if (!vehicle.deviceId) {
        return reply.status(200).send({ trips: [] });
      }
      const { from: fromStr, to: toStr } = request.query;
      const to = toStr ? new Date(toStr) : new Date();
      const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

      const prisma = getPrismaClient();
      const [positions, tripMerges] = await Promise.all([
        prisma.position.findMany({
          where: {
            deviceId: vehicle.deviceId,
            timestamp: { gte: from, lte: to },
          },
          orderBy: { timestamp: 'asc' },
        }),
        prisma.tripMerge.findMany({
          where: { deviceId: vehicle.deviceId },
        }),
      ]);

      function isGapMerged(prevTs: Date, nextTs: Date): boolean {
        const prevT = prevTs.getTime();
        const nextT = nextTs.getTime();
        return tripMerges.some(
          (m) =>
            Math.abs(m.gapAfter.getTime() - prevT) <= TRIP_MERGE_TOLERANCE_MS &&
            Math.abs(m.gapBefore.getTime() - nextT) <= TRIP_MERGE_TOLERANCE_MS
        );
      }

      const trips: Array<{
        startedAt: Date;
        endedAt: Date;
        startLat: number;
        startLon: number;
        endLat: number;
        endLon: number;
        distanceKm: number;
        pointCount: number;
      }> = [];
      let current: typeof positions = [];
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const prev = positions[i - 1];
        const gapExceeds = prev && p.timestamp.getTime() - prev.timestamp.getTime() > TRIP_GAP_MS;
        const shouldSplit = gapExceeds && !isGapMerged(prev.timestamp, p.timestamp);
        if (shouldSplit) {
          if (current.length > 0) {
            const start = current[0];
            const end = current[current.length - 1];
            let dist = 0;
            for (let j = 1; j < current.length; j++) {
              dist += haversineKm(
                current[j - 1].latitude,
                current[j - 1].longitude,
                current[j].latitude,
                current[j].longitude,
              );
            }
            trips.push({
              startedAt: start.timestamp,
              endedAt: end.timestamp,
              startLat: start.latitude,
              startLon: start.longitude,
              endLat: end.latitude,
              endLon: end.longitude,
              distanceKm: Math.round(dist * 1000) / 1000,
              pointCount: current.length,
            });
          }
          current = [p];
        } else {
          current.push(p);
        }
      }
      if (current.length > 0) {
        const start = current[0];
        const end = current[current.length - 1];
        let dist = 0;
        for (let j = 1; j < current.length; j++) {
          dist += haversineKm(
            current[j - 1].latitude,
            current[j - 1].longitude,
            current[j].latitude,
            current[j].longitude,
          );
        }
        trips.push({
          startedAt: start.timestamp,
          endedAt: end.timestamp,
          startLat: start.latitude,
          startLon: start.longitude,
          endLat: end.latitude,
          endLon: end.longitude,
          distanceKm: Math.round(dist * 1000) / 1000,
          pointCount: current.length,
        });
      }

      return reply.status(200).send({
        trips: trips.map((t) => ({
          ...t,
          startedAt: t.startedAt,
          endedAt: t.endedAt,
        })),
      });
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/v1/vehicles/:id/trip-merges',
    async (request, reply) => {
      const { id } = request.params;
      const vehicle = await vehicleRepository.findVehicleById(id);
      if (!vehicle) throw new NotFoundError('Vehicle', id);
      if (!vehicle.deviceId) {
        return reply.status(400).send({ error: 'Vehicle has no linked device' });
      }
      const body = validate(request.body, CreateTripMergeSchema) as { gapAfter: string; gapBefore: string };
      const prisma = getPrismaClient();
      const merge = await prisma.tripMerge.create({
        data: {
          deviceId: vehicle.deviceId,
          gapAfter: new Date(body.gapAfter),
          gapBefore: new Date(body.gapBefore),
        },
      });
      return reply.status(201).send({
        id: merge.id,
        gapAfter: merge.gapAfter.toISOString(),
        gapBefore: merge.gapBefore.toISOString(),
      });
    }
  );

  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id/trip-merges', async (request, reply) => {
    const { id } = request.params;
    const vehicle = await vehicleRepository.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    if (!vehicle.deviceId) {
      return reply.status(200).send({ tripMerges: [] });
    }
    const prisma = getPrismaClient();
    const merges = await prisma.tripMerge.findMany({
      where: { deviceId: vehicle.deviceId },
      orderBy: { gapAfter: 'asc' },
    });
    return reply.status(200).send({
      tripMerges: merges.map((m) => ({
        id: m.id,
        gapAfter: m.gapAfter.toISOString(),
        gapBefore: m.gapBefore.toISOString(),
      })),
    });
  });

  app.delete<{ Params: { id: string }; Querystring: { gapAfter?: string; gapBefore?: string } }>(
    '/api/v1/vehicles/:id/trip-merges',
    async (request, reply) => {
      const { id } = request.params;
      const { gapAfter: gapAfterStr, gapBefore: gapBeforeStr } = request.query;
      const vehicle = await vehicleRepository.findVehicleById(id);
      if (!vehicle) throw new NotFoundError('Vehicle', id);
      if (!vehicle.deviceId || !gapAfterStr || !gapBeforeStr) {
        return reply.status(400).send({ error: 'gapAfter and gapBefore query params required' });
      }
      const prisma = getPrismaClient();
      const gapAfter = new Date(gapAfterStr);
      const gapBefore = new Date(gapBeforeStr);
      if (Number.isNaN(gapAfter.getTime()) || Number.isNaN(gapBefore.getTime())) {
        return reply.status(400).send({ error: 'Invalid gapAfter or gapBefore' });
      }
      await prisma.tripMerge.deleteMany({
        where: {
          deviceId: vehicle.deviceId,
          gapAfter: { gte: new Date(gapAfter.getTime() - TRIP_MERGE_TOLERANCE_MS), lte: new Date(gapAfter.getTime() + TRIP_MERGE_TOLERANCE_MS) },
          gapBefore: { gte: new Date(gapBefore.getTime() - TRIP_MERGE_TOLERANCE_MS), lte: new Date(gapBefore.getTime() + TRIP_MERGE_TOLERANCE_MS) },
        },
      });
      return reply.status(204).send();
    }
  );
}
