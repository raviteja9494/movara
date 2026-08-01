import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerDeviceRoutes } from './devices';
import { registerPositionRoutes } from './positions';
import { Gt06Server } from '../protocols/gt06/Gt06Server';
import { EelinkServer } from '../protocols/eelink/EelinkServer';
import { OsmAndServer } from '../protocols/osmand/OsmAndServer';
import { ProcessIncomingPositionUseCase } from '../../application/use-cases/ProcessIncomingPositionUseCase';
import { EnsureTrackingDeviceUseCase } from '../../application/use-cases/EnsureTrackingDeviceUseCase';
import { PrismaPositionRepository } from '../persistence/PrismaPositionRepository';
import { PrismaDeviceRepository } from '../persistence/PrismaDeviceRepository';
import { eventDispatcher } from '../../../../shared/utils';
import { AutoTripOnIgnitionSubscriber } from '../../../trips/infrastructure/AutoTripOnIgnitionSubscriber';
import { SendDeviceCommandUseCase } from '../../application/use-cases/SendDeviceCommandUseCase';
import type { DeviceStateStore } from '../device/DeviceStateStore';
import type { DeviceCommandStore } from '../device/DeviceCommandStore';
import type { LiveDeviceConnectionRegistry } from '../device/LiveDeviceConnectionRegistry';
import type { PrismaRawLogStore } from '../persistence/PrismaRawLogStore';
import type { DeviceUseCases } from '../../application/use-cases';
import { actingUserId, type InstanceOperatorPolicy, type OwnershipPolicy } from '../../../../shared/authorization';

const MobilePositionSchema = z.object({
  deviceLabel: z.string().min(1).max(80).optional(),
  timestamp: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'timestamp must be valid'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  speed: z.coerce.number().min(0).optional().nullable(),
  accuracy: z.coerce.number().min(0).optional().nullable(),
  altitude: z.coerce.number().optional().nullable(),
  batteryLevel: z.coerce.number().min(0).max(100).optional().nullable(),
});

const MobileTrackerStateSchema = z.object({
  deviceLabel: z.string().min(1).max(80),
  active: z.boolean(),
  protocol: z.literal('osmand').optional().default('osmand'),
});

export interface TrackingRouteDependencies {
  positionRepository: PrismaPositionRepository;
  deviceRepository: PrismaDeviceRepository;
  autoTripOnIgnitionSubscriber: AutoTripOnIgnitionSubscriber;
  processPositionUseCase: ProcessIncomingPositionUseCase;
  ensureTrackingDeviceUseCase: EnsureTrackingDeviceUseCase;
  sendDeviceCommandUseCase: SendDeviceCommandUseCase;
  deviceStateStore: DeviceStateStore;
  deviceCommandStore: DeviceCommandStore;
  liveDeviceConnectionRegistry: LiveDeviceConnectionRegistry;
  rawLogStore: PrismaRawLogStore;
  deviceUseCases: DeviceUseCases;
  ownership: OwnershipPolicy;
  instanceOperatorPolicy: InstanceOperatorPolicy;
}

export async function registerTrackingRoutes(
  app: FastifyInstance,
  dependencies: TrackingRouteDependencies,
) {
  const {
    positionRepository,
    deviceRepository,
    autoTripOnIgnitionSubscriber,
    processPositionUseCase,
    ensureTrackingDeviceUseCase,
    sendDeviceCommandUseCase,
    deviceStateStore,
    deviceCommandStore,
    liveDeviceConnectionRegistry,
    rawLogStore,
    deviceUseCases,
    ownership,
    instanceOperatorPolicy,
  } = dependencies;
  eventDispatcher.subscribe('position.recorded', (evt) => autoTripOnIgnitionSubscriber.handle(evt as any));
  eventDispatcher.subscribe('device.telemetry', (evt) => autoTripOnIgnitionSubscriber.handleTelemetry(evt as any));
  await registerDeviceRoutes(app, {
    deviceUseCases,
    sendDeviceCommandUseCase,
    deviceStateStore,
  });
  await registerPositionRoutes(app, positionRepository, ownership);

  app.post<{ Body: unknown }>('/api/v1/mobile/positions', async (request, reply) => {
    const userId = actingUserId(request);
    const body = MobilePositionSchema.parse(request.body ?? {});
    const label = body.deviceLabel?.trim() || 'phone';
    const deviceId = `movara-mobile-${userId}-${label}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 64);
    const attributes: Record<string, unknown> = {
      source: 'movara_android',
    };
    if (body.accuracy != null) attributes.accuracy = body.accuracy;
    if (body.altitude != null) attributes.altitude = body.altitude;
    if (body.batteryLevel != null) attributes.battery_level = body.batteryLevel;

    const position = await processPositionUseCase.execute({
      actorId: userId,
      deviceId,
      timestamp: new Date(body.timestamp),
      receivedAt: new Date(),
      latitude: body.latitude,
      longitude: body.longitude,
      speed: body.speed ?? undefined,
      attributes,
    });

    return reply.status(201).send({
      position: {
        id: position.id,
        deviceId: position.deviceId,
        timestamp: position.timestamp.toISOString(),
        latitude: position.latitude,
        longitude: position.longitude,
        speed: position.speed,
        attributes: position.attributes,
      },
    });
  });

  app.post<{ Body: unknown }>('/api/v1/mobile/tracker-state', async (request, reply) => {
    const body = MobileTrackerStateSchema.parse(request.body ?? {});
    const rawLabel = body.deviceLabel.trim();
    const deviceId = `osmand-${rawLabel}`;
    const timestamp = new Date();
    await ensureTrackingDeviceUseCase.requireOwned(actingUserId(request), deviceId);
    await deviceStateStore.updateProtocol(deviceId, body.protocol);
    await deviceStateStore.updateLastAttributes(deviceId, {
      source: 'movara_android',
      tracker_active: body.active,
      tracker_event: body.active ? 'started' : 'stopped',
    });
    await deviceStateStore.setStatus(deviceId, body.active ? 'online' : 'offline', timestamp);
    void eventDispatcher.dispatch(body.active ? 'device.online' : 'device.offline', {
      eventId: crypto.randomUUID(),
      occurredAt: timestamp,
      aggregateId: deviceId,
      deviceId,
      protocol: body.protocol,
      source: 'movara_android',
    } as any);

    return reply.status(200).send({
      device: {
        imei: deviceId,
        status: await deviceStateStore.getStatus(deviceId),
        lastSeen: (await deviceStateStore.getLastSeen(deviceId))?.toISOString() ?? null,
        protocol: await deviceStateStore.getProtocol(deviceId),
      },
    });
  });

  app.get<{ Querystring: { port?: string; limit?: string } }>('/api/v1/raw-log', async (request) => {
    instanceOperatorPolicy.assertAuthorized(request.headers['x-movara-admin-token']);
    const port = request.query.port != null ? parseInt(request.query.port, 10) : undefined;
    const limit = request.query.limit != null ? parseInt(request.query.limit, 10) : undefined;
    const entries = await rawLogStore.getEntries({
      port: Number.isNaN(port as number) ? undefined : (port as number),
      limit: limit != null && !Number.isNaN(limit) ? Math.min(limit, 200) : 100,
    });
    return { entries };
  });

  app.delete('/api/v1/raw-log', async (request, reply) => {
    instanceOperatorPolicy.assertAuthorized(request.headers['x-movara-admin-token']);
    await rawLogStore.clear();
    return reply.code(204).send();
  });

  const gt06Port = parsePort(process.env.GT06_PORT, 5023);
  const eelinkPort = parsePort(process.env.EELINK_PORT, 5064);
  const osmandPort = parsePort(process.env.OSMAND_PORT, 5055);
  const gt06Server = new Gt06Server(
    processPositionUseCase,
    ensureTrackingDeviceUseCase,
    sendDeviceCommandUseCase,
    deviceStateStore,
    deviceCommandStore,
    liveDeviceConnectionRegistry,
    rawLogStore,
    gt06Port,
    app.log,
  );
  const eelinkServer = new EelinkServer(
    processPositionUseCase,
    ensureTrackingDeviceUseCase,
    sendDeviceCommandUseCase,
    deviceStateStore,
    deviceCommandStore,
    liveDeviceConnectionRegistry,
    rawLogStore,
    { port: eelinkPort },
    app.log,
  );
  const osmandServer = new OsmAndServer(
    processPositionUseCase,
    deviceRepository,
    deviceStateStore,
    rawLogStore,
    osmandPort,
    app.log,
  );

  app.addHook('onListen', async () => {
    try {
      await gt06Server.start();
      app.log.info(`GT06 GPS tracker protocol server started on port ${gt06Port}`);
    } catch (err: unknown) {
      app.log.error({ err }, 'Failed to start GT06 server');
    }
    try {
      await eelinkServer.start();
      app.log.info(`Eelink tracker plain TCP server started on port ${eelinkPort}`);
    } catch (err: unknown) {
      app.log.error({ err }, 'Failed to start Eelink server');
    }
    try {
      await osmandServer.start();
      app.log.info(`OsmAnd protocol server started on port ${osmandPort} (Traccar Client compatible)`);
    } catch (err: unknown) {
      app.log.error({ err }, 'Failed to start OsmAnd server');
    }
  });

  app.addHook('onClose', async () => {
    try {
      await gt06Server.stop();
      app.log.info('GT06 server stopped');
    } catch (err: unknown) {
      app.log.error({ err }, 'Error stopping GT06 server');
    }
    try {
      await eelinkServer.stop();
      app.log.info('Eelink server stopped');
    } catch (err: unknown) {
      app.log.error({ err }, 'Error stopping Eelink server');
    }
    try {
      await osmandServer.stop();
      app.log.info('OsmAnd server stopped');
    } catch (err: unknown) {
      app.log.error({ err }, 'Error stopping OsmAnd server');
    }
  });
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = value != null ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
