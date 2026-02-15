import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { PrismaVehicleRepository, PrismaFuelRecordRepository } from '../persistence';
import {
  validate,
  CreateVehicleSchema,
  UpdateVehicleSchema,
  CreateFuelRecordSchema,
  UpdateFuelRecordSchema,
  PaginationQuerySchema,
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
} from '../../../../shared/uploads/uploads';

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
  fuelType: string | null;
  icon: string | null;
  photoPath: string | null;
  deviceId: string | null;
  createdAt: Date;
}) {
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
    fuelType: v.fuelType,
    icon: v.icon,
    photoPath: v.photoPath,
    deviceId: v.deviceId,
    createdAt: v.createdAt,
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
    });

    return createPaginatedResponse(
      vehicles.map(vehicleToDto),
      total,
      paginationParams.page,
      paginationParams.limit,
    );
  });

  app.get<{ Params: { id: string } }>('/api/v1/vehicles/:id', async (request, reply) => {
    const { id } = request.params;
    const vehicle = await vehicleRepository.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    return reply.status(200).send({
      vehicle: vehicleToDto({
        id: vehicle.id,
        name: vehicle.name,
        description: vehicle.description,
        licensePlate: vehicle.licensePlate,
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        currentOdometer: vehicle.currentOdometer,
        fuelType: vehicle.fuelType,
        icon: vehicle.icon,
        photoPath: vehicle.photoPath,
        deviceId: vehicle.deviceId,
        createdAt: vehicle.createdAt,
      }),
    });
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
    const vehicle = Vehicle.create(validatedData);
    const created = await vehicleRepository.createVehicle(vehicle);
    return reply.status(201).send({
      vehicle: vehicleToDto({
        id: created.id,
        name: created.name,
        description: created.description,
        licensePlate: created.licensePlate,
        vin: created.vin,
        year: created.year,
        make: created.make,
        model: created.model,
        currentOdometer: created.currentOdometer,
        fuelType: created.fuelType,
        icon: created.icon,
        photoPath: created.photoPath,
        deviceId: created.deviceId,
        createdAt: created.createdAt,
      }),
    });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/v1/vehicles/:id',
    async (request, reply) => {
      const { id } = request.params;
      const existing = await vehicleRepository.findVehicleById(id);
      if (!existing) throw new NotFoundError('Vehicle', id);
      const data = validate(request.body, UpdateVehicleSchema) as {
        name?: string;
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
      const updated = await vehicleRepository.updateVehicle(id, data);
      const u = updated!;
      return reply.status(200).send({
        vehicle: vehicleToDto({
          id: u.id,
          name: u.name,
          description: u.description,
          licensePlate: u.licensePlate,
          vin: u.vin,
          year: u.year,
          make: u.make,
          model: u.model,
          currentOdometer: u.currentOdometer,
          fuelType: u.fuelType,
          icon: u.icon,
          photoPath: u.photoPath,
          deviceId: u.deviceId,
          createdAt: u.createdAt,
        }),
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
    const relativePath = `vehicles/${filename}`;
    await vehicleRepository.updateVehicle(id, { photoPath: relativePath });
    const updated = await vehicleRepository.findVehicleById(id);
    return reply.status(200).send({
      vehicle: vehicleToDto({
        id: updated!.id,
        name: updated!.name,
        description: updated!.description,
        licensePlate: updated!.licensePlate,
        vin: updated!.vin,
        year: updated!.year,
        make: updated!.make,
        model: updated!.model,
        currentOdometer: updated!.currentOdometer,
        fuelType: updated!.fuelType,
        icon: updated!.icon,
        photoPath: updated!.photoPath,
        deviceId: updated!.deviceId,
        createdAt: updated!.createdAt,
      }),
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
      const positions = await prisma.position.findMany({
        where: {
          deviceId: vehicle.deviceId,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: 'asc' },
      });

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
        if (prev && p.timestamp.getTime() - prev.timestamp.getTime() > TRIP_GAP_MS) {
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
}
