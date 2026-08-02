import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { join } from 'path';
import { BackupService } from '../../application/BackupService';
import {
  validate,
  CreateBackupSchema,
  RestoreBackupSchema,
} from '../../../../shared/validation';
import { runtimeSettingsStore } from '../../../../shared/runtimeSettings/RuntimeSettingsStore';
import { deleteLogFile, getLogFilePath, listLogFiles, previewLogFile, readLogFile } from '../../../../shared/logging/LogFileManager';
import { computeTripStats } from '../../../../shared/utils';
import type { DeviceStateStore } from '../../../tracking/infrastructure/device/DeviceStateStore';
import type { DeviceCommandStore } from '../../../tracking/infrastructure/device/DeviceCommandStore';
import type { DeviceCommandRecord } from '../../../tracking/application/device-commands/types';
import type { VehicleUseCases } from '../../../vehicles/application/use-cases';
import type { MaintenanceReminderUseCase } from '../../../maintenance/application/use-cases';
import { actingUserId } from '../../../../shared/authorization';
import type { InstanceOperatorPolicy } from '../../../../shared/authorization';

const ACTIVE_AUTO_IGNITION_SOURCE = 'auto-ignition-active';
const systemRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
    },
  },
};

function getBackupDir(): string {
  if (process.env.BACKUP_DIR) return process.env.BACKUP_DIR;
  return path.resolve(process.cwd(), 'backups');
}

function resolveBackupPath(input: string): string | null {
  const backupDir = path.resolve(getBackupDir());
  const resolved = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(path.join(backupDir, input));
  const relative = path.relative(backupDir, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

function serializeCommand(command: DeviceCommandRecord | null) {
  if (!command) return null;
  return {
    ...command,
    createdAt: command.createdAt.toISOString(),
    sentAt: command.sentAt?.toISOString() ?? null,
    respondedAt: command.respondedAt?.toISOString() ?? null,
    response: command.response ?? null,
  };
}

function durationSeconds(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

export interface SystemRouteDependencies {
  prisma: PrismaClient;
  backupService: BackupService;
  deviceStateStore: DeviceStateStore;
  deviceCommandStore: DeviceCommandStore;
  vehicleUseCases: VehicleUseCases;
  maintenanceReminderUseCase: MaintenanceReminderUseCase;
  instanceOperatorPolicy: InstanceOperatorPolicy;
}

export async function registerSystemRoutes(
  app: FastifyInstance,
  dependencies: SystemRouteDependencies,
) {
  const { prisma, backupService, deviceStateStore, deviceCommandStore, vehicleUseCases, maintenanceReminderUseCase, instanceOperatorPolicy } = dependencies;
  app.addHook('preHandler', async (request) => {
    if (request.url.split('?')[0].startsWith('/api/v1/system/')) {
      instanceOperatorPolicy.assertAuthorized(request.headers['x-movara-admin-token']);
    }
  });
  app.get('/api/v1/home-assistant/snapshot', async (request, reply) => {
    const userId = actingUserId(request);
    const now = new Date();
    const [devices, vehicles] = await Promise.all([
      prisma.device.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          positions: {
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.vehicle.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const vehiclesWithEstimates = await Promise.all(vehicles.map(async (vehicle) => {
      const details = await vehicleUseCases.get(userId, vehicle.id);
      return {
        ...vehicle,
        estimatedOdometerKm: details.vehicle.estimatedOdometerKm,
        estimatedOdometerUpdatedAt: details.vehicle.estimatedOdometerUpdatedAt,
      };
    }));
    const reminderSummaries = new Map(await Promise.all(vehiclesWithEstimates.map(async (vehicle) => [
      vehicle.id,
      await maintenanceReminderUseCase.buildForVehicle(
        userId,
        vehicle.id,
        vehicle.estimatedOdometerKm ?? vehicle.currentOdometer ?? null,
        now,
      ),
    ] as const)));

    const latestTrips = await Promise.all(
      vehiclesWithEstimates.map((vehicle) =>
        prisma.trip.findFirst({
          where: {
            userId,
            vehicleId: vehicle.id,
            source: { not: ACTIVE_AUTO_IGNITION_SOURCE },
          },
          orderBy: { startTime: 'desc' },
          include: {
            device: { select: { id: true, imei: true, name: true } },
            vehicle: { select: { id: true, name: true } },
          },
        }),
      ),
    );
    const latestTripByVehicleId = new Map<string, NonNullable<(typeof latestTrips)[number]>>();
    for (const trip of latestTrips) {
      if (!trip?.vehicleId) continue;
      latestTripByVehicleId.set(trip.vehicleId, trip);
    }

    const latestTripPayloadByVehicleId = new Map<string, unknown>();
    await Promise.all(
      [...latestTripByVehicleId.entries()].map(async ([vehicleId, trip]) => {
        const points =
          trip.source === 'imported'
            ? await prisma.tripPosition.findMany({
                where: { userId, tripId: trip.id },
                orderBy: [{ timestamp: 'asc' }, { sortOrder: 'asc' }],
              })
            : trip.deviceId
              ? await prisma.position.findMany({
                  where: {
                    userId,
                    deviceId: trip.deviceId,
                    timestamp: { gte: trip.startTime, lte: trip.endTime },
                  },
                  orderBy: { timestamp: 'asc' },
                })
              : [];
        const stats = computeTripStats(
          points.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            speed: point.speed,
            timestamp: point.timestamp,
          })),
        );
        latestTripPayloadByVehicleId.set(vehicleId, {
          id: trip.id,
          deviceId: trip.deviceId,
          device: trip.device,
          vehicleId: trip.vehicleId,
          vehicle: trip.vehicle,
          startTime: trip.startTime.toISOString(),
          endTime: trip.endTime.toISOString(),
          name: trip.name,
          favorite: trip.favorite,
          source: trip.source,
          createdAt: trip.createdAt.toISOString(),
          stats,
          durationSeconds: durationSeconds(trip.startTime, trip.endTime),
        });
      }),
    );

    return reply.status(200).send({
      devices: await Promise.all(devices.map(async (device) => {
        const latestPosition = device.positions[0] ?? null;
        const state = await deviceStateStore.getSnapshot(device.imei);
        const latestCommand = (await deviceCommandStore.listByDevice(device.id, 1))[0] ?? null;
        return {
          id: device.id,
          imei: device.imei,
          name: device.name,
          createdAt: device.createdAt.toISOString(),
          lastSeen: state.lastSeen?.toISOString() ?? null,
          status: state.status,
          protocol: state.protocol,
          lastAttributes: state.lastAttributes,
          packetAttributes: state.packetAttributes.map((snapshot) => ({
            packetId: snapshot.packetId,
            updatedAt: snapshot.updatedAt.toISOString(),
            attributes: snapshot.attributes,
          })),
          latest_position: latestPosition
            ? {
                id: latestPosition.id,
                deviceId: latestPosition.deviceId,
                timestamp: latestPosition.timestamp.toISOString(),
                latitude: latestPosition.latitude,
                longitude: latestPosition.longitude,
                speed: latestPosition.speed,
                createdAt: latestPosition.createdAt.toISOString(),
                attributes: latestPosition.attributes ?? undefined,
              }
            : null,
          latest_command: serializeCommand(latestCommand),
        };
      })),
      vehicles: vehiclesWithEstimates.map((vehicle) => ({
        id: vehicle.id,
        name: vehicle.name,
        description: vehicle.description,
        licensePlate: vehicle.licensePlate,
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        currentOdometer: vehicle.currentOdometer,
        estimatedOdometerKm: vehicle.estimatedOdometerKm,
        estimatedOdometerCalibratedAt: vehicle.estimatedOdometerBaseAt?.toISOString() ?? null,
        fuelType: vehicle.fuelType,
        icon: vehicle.icon,
        photoPath: vehicle.photoPath,
        deviceId: vehicle.deviceId,
        createdAt: vehicle.createdAt.toISOString(),
        latest_trip: latestTripPayloadByVehicleId.get(vehicle.id) ?? null,
        reminders: reminderSummaries.get(vehicle.id),
      })),
    });
  });

  app.get('/api/v1/system/runtime-settings', systemRateLimit, async (_request, reply) => {
    return reply.status(200).send({
      settings: runtimeSettingsStore.get(),
    });
  });

  app.post<{ Body?: {
    protocolDebugEnabled?: boolean;
    protocolDebugDir?: string;
    protocolLogLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'raw';
    appLogLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    autoStopMinDurationMinutes?: number;
    autoStopMoveThresholdMeters?: number;
    autoStopMinPoints?: number;
  } }>(
    '/api/v1/system/runtime-settings',
    systemRateLimit,
    async (request, reply) => {
      const settings = await runtimeSettingsStore.update({
        protocolDebugEnabled: request.body?.protocolDebugEnabled,
        protocolDebugDir: request.body?.protocolDebugDir,
        protocolLogLevel: request.body?.protocolLogLevel,
        appLogLevel: request.body?.appLogLevel,
        autoStopMinDurationMinutes: request.body?.autoStopMinDurationMinutes,
        autoStopMoveThresholdMeters: request.body?.autoStopMoveThresholdMeters,
        autoStopMinPoints: request.body?.autoStopMinPoints,
      });
      app.log.level = settings.appLogLevel;
      return reply.status(200).send({ settings });
    },
  );

  app.get('/api/v1/system/logs', systemRateLimit, async (_request, reply) => {
    return reply.status(200).send({
      files: listLogFiles(),
    });
  });

  app.get<{ Querystring: { name?: string } }>('/api/v1/system/logs/content', systemRateLimit, async (request, reply) => {
    const name = request.query.name?.trim();
    if (!name) {
      return reply.status(400).send({ error: 'Log file name is required' });
    }
    try {
      const content = readLogFile(name);
      return reply.type('text/plain; charset=utf-8').send(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read log file';
      const status = message === 'Invalid log file' ? 400 : 404;
      return reply.status(status).send({ error: message });
    }
  });

  app.get<{ Querystring: { name?: string; maxBytes?: string } }>('/api/v1/system/logs/preview', systemRateLimit, async (request, reply) => {
    const name = request.query.name?.trim();
    if (!name) {
      return reply.status(400).send({ error: 'Log file name is required' });
    }
    const maxBytes = request.query.maxBytes != null ? parseInt(request.query.maxBytes, 10) : undefined;
    try {
      const preview = previewLogFile(name, Number.isFinite(maxBytes) ? maxBytes : undefined);
      return reply.status(200).send(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to preview log file';
      const status = message === 'Invalid log file' ? 400 : 404;
      return reply.status(status).send({ error: message });
    }
  });

  app.get<{ Querystring: { name?: string } }>('/api/v1/system/logs/download', systemRateLimit, async (request, reply) => {
    const name = request.query.name?.trim();
    if (!name) {
      return reply.status(400).send({ error: 'Log file name is required' });
    }
    try {
      const fullPath = getLogFilePath(name);
      const buffer = await fs.readFile(fullPath);
      return reply
        .header('Content-Disposition', `attachment; filename="${name}"`)
        .type('text/plain; charset=utf-8')
        .send(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download log file';
      const status = message === 'Invalid log file' ? 400 : 404;
      return reply.status(status).send({ error: message });
    }
  });

  app.delete<{ Querystring: { name?: string } }>('/api/v1/system/logs', systemRateLimit, async (request, reply) => {
    const name = request.query.name?.trim();
    if (!name) {
      return reply.status(400).send({ error: 'Log file name is required' });
    }
    try {
      deleteLogFile(name);
      return reply.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete log file';
      const status = message === 'Invalid log file' ? 400 : 404;
      return reply.status(status).send({ error: message });
    }
  });

  /**
   * Export database: single request that creates backup in temp dir, returns .sql.gz file
   * (like Export GPX – browser downloads directly). Uses raw response so the body is never JSON-serialized.
   */
  app.post('/api/v1/system/backup/export', systemRateLimit, async (_request, reply) => {
    const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'movara-export-'));
    try {
      const result = await backupService.createBackup(tmpDir);
      const gzPath = join(result.path, 'db.sql.gz');
      await fs.access(gzPath);
      const buffer = await fs.readFile(gzPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `movara-backup-${timestamp}.sql.gz`;
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      });
      res.end(buffer);
      (reply as { sent?: boolean }).sent = true;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  app.post('/api/v1/system/backup', systemRateLimit, async (request, reply) => {
    validate(request.body ?? {}, CreateBackupSchema);
    const result = await backupService.createBackup(getBackupDir());
    const basename = path.basename(result.path);
    return reply.status(201).send({
      status: 'success',
      backup: { path: result.path, timestamp: result.timestamp, downloadPath: basename },
    });
  });

  app.get<{ Querystring: { path: string } }>('/api/v1/system/backup/download', systemRateLimit, async (request, reply) => {
    const downloadPath = request.query.path;
    if (!downloadPath) {
      return reply.status(400).send({ error: 'Invalid path' });
    }
    const backupPath = resolveBackupPath(downloadPath);
    if (!backupPath) {
      return reply.status(400).send({ error: 'Invalid path' });
    }
    const fullPath = path.join(backupPath, 'db.sql.gz');
    try {
      await fs.access(fullPath);
    } catch {
      return reply.status(404).send({ error: 'Backup not found' });
    }
    const filename = `movara-backup-${downloadPath}.sql.gz`;
    const buffer = await fs.readFile(fullPath);
    return reply
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .type('application/gzip')
      .send(buffer);
  });

  async function reconnectAfterRestore(): Promise<void> {
    await runtimeSettingsStore.initialize(prisma);
    app.log.level = runtimeSettingsStore.get().appLogLevel;
  }

  app.post('/api/v1/system/restore', systemRateLimit, async (request, reply) => {
    const validatedData = validate(request.body, RestoreBackupSchema);
    const backupPath = resolveBackupPath(validatedData.backupPath);
    if (!backupPath) {
      return reply.status(400).send({ error: 'Invalid backup path' });
    }
    await prisma.$disconnect();
    try {
      const result = await backupService.restoreBackup(backupPath);
      await reconnectAfterRestore();
      return reply.status(200).send({
        status: 'success',
        restore: result,
      });
    } catch (error) {
      await reconnectAfterRestore().catch(() => undefined);
      throw error;
    }
  });

  app.post('/api/v1/system/restore/upload', systemRateLimit, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'Backup file required (.sql.gz)' });
    const buffer = await data.toBuffer();
    if (buffer.length < 2) return reply.status(400).send({ error: 'File too small; expected a gzip backup (.sql.gz)' });
    const gzipMagic = buffer[0] === 0x1f && buffer[1] === 0x8b;
    if (!gzipMagic) {
      return reply.status(400).send({
        error: 'Invalid backup file. Upload a .sql.gz file exported from Movara (Settings → Export database).',
      });
    }
    const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'movara-restore-'));
    try {
      const gzPath = join(tmpDir, 'db.sql.gz');
      const metaPath = join(tmpDir, 'metadata.json');
      await fs.writeFile(gzPath, buffer);
      await fs.writeFile(metaPath, JSON.stringify({ timestamp: new Date().toISOString(), database: 'movara' }));
      await prisma.$disconnect();
      try {
        const result = await backupService.restoreBackup(tmpDir);
        await reconnectAfterRestore();
        return reply.status(200).send({ status: 'success', restore: result });
      } catch (error) {
        await reconnectAfterRestore().catch(() => undefined);
        throw error;
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  app.post<{ Body?: { includeTracking?: boolean } }>('/api/v1/system/clear-trips', systemRateLimit, async (request, reply) => {
    const includeTracking = request.body?.includeTracking === true;
    await prisma.tripPosition.deleteMany({});
    await prisma.trip.deleteMany({});
    if (includeTracking) {
      await prisma.position.deleteMany({});
      await prisma.tripMerge.deleteMany({});
    }
    return reply.status(200).send({
      status: 'success',
      message: includeTracking ? 'Trips and tracking data cleared' : 'Trips cleared',
    });
  });

  app.post('/api/v1/system/clear-database', systemRateLimit, async (_request, reply) => {
    await prisma.rawLogEntry.deleteMany({});
    await prisma.savedLocation.deleteMany({});
    await prisma.tripPosition.deleteMany({});
    await prisma.trip.deleteMany({});
    await prisma.fuelRecord.deleteMany({});
    await prisma.vehicleRecord.deleteMany({});
    await prisma.position.deleteMany({});
    await prisma.tripMerge.deleteMany({});
    await prisma.vehicle.updateMany({ data: { deviceId: null } });
    await prisma.vehicle.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.runtimeSettings.deleteMany({});
    await runtimeSettingsStore.reset();
    return reply.status(200).send({ status: 'success', message: 'Database cleared' });
  });
}
