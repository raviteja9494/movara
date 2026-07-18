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
import { InMemoryWebhookRepository } from '../../../../infrastructure/webhooks/InMemoryWebhookRepository';
import { PrismaDeviceRepository } from '../persistence/PrismaDeviceRepository';
import { WebhookDispatcher } from '../../../../infrastructure/webhooks/WebhookDispatcher';
import { eventDispatcher } from '../../../../shared/utils';
import { rawLogBuffer } from '../../../../shared/rawLog/RawLogBuffer';
import { AutoTripOnIgnitionSubscriber } from '../../../trips/infrastructure/AutoTripOnIgnitionSubscriber';
import { SendDeviceCommandUseCase } from '../../application/use-cases/SendDeviceCommandUseCase';
import type { AuthUser } from '../../../auth/infrastructure/api';

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

export async function registerTrackingRoutes(app: FastifyInstance) {
  const positionRepository = new PrismaPositionRepository();
  const deviceRepository = new PrismaDeviceRepository();
  // Setup webhook dispatcher (in-memory repository). This is kept simple
  // per requirement: no queues/workers; deliveries are fire-and-forget.
  const webhookRepo = new InMemoryWebhookRepository();
  const webhookDispatcher = new WebhookDispatcher(webhookRepo);

  // Subscribe webhook dispatcher to relevant domain events (non-blocking handlers)
  eventDispatcher.subscribe('position.received', (evt) => {
    void webhookDispatcher.dispatch('position.received', evt);
  });

  eventDispatcher.subscribe('device.online', (evt) => {
    void webhookDispatcher.dispatch('device.online', evt);
  });

  eventDispatcher.subscribe('device.offline', (evt) => {
    void webhookDispatcher.dispatch('device.offline', evt);
  });
  const autoTripOnIgnitionSubscriber = new AutoTripOnIgnitionSubscriber();
  eventDispatcher.subscribe('position.recorded', (evt) => autoTripOnIgnitionSubscriber.handle(evt as any));
  eventDispatcher.subscribe('device.telemetry', (evt) => autoTripOnIgnitionSubscriber.handleTelemetry(evt as any));
  const processPositionUseCase = new ProcessIncomingPositionUseCase(positionRepository, deviceRepository);
  const ensureTrackingDeviceUseCase = new EnsureTrackingDeviceUseCase(deviceRepository);
  const sendDeviceCommandUseCase = new SendDeviceCommandUseCase();
  await registerDeviceRoutes(app, sendDeviceCommandUseCase);
  await registerPositionRoutes(app);

  app.post<{ Body: unknown }>('/api/v1/mobile/positions', async (request, reply) => {
    const user = (request as { user?: AuthUser }).user;
    const body = MobilePositionSchema.parse(request.body ?? {});
    const label = body.deviceLabel?.trim() || 'phone';
    const userKey = user?.id ?? 'unknown';
    const deviceId = `movara-mobile-${userKey}-${label}`
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

  app.get<{ Querystring: { port?: string; limit?: string } }>('/api/v1/raw-log', async (request) => {
    const port = request.query.port != null ? parseInt(request.query.port, 10) : undefined;
    const limit = request.query.limit != null ? parseInt(request.query.limit, 10) : undefined;
    const entries = rawLogBuffer.getEntries({
      port: Number.isNaN(port as number) ? undefined : (port as number),
      limit: limit != null && !Number.isNaN(limit) ? Math.min(limit, 200) : 100,
    });
    return { entries };
  });

  app.delete('/api/v1/raw-log', async (_request, reply) => {
    rawLogBuffer.clear();
    return reply.code(204).send();
  });

  const gt06Port = parsePort(process.env.GT06_PORT, 5023);
  const eelinkPort = parsePort(process.env.EELINK_PORT, 5064);
  const osmandPort = parsePort(process.env.OSMAND_PORT, 5055);
  const gt06Server = new Gt06Server(processPositionUseCase, ensureTrackingDeviceUseCase, sendDeviceCommandUseCase, gt06Port, app.log);
  const eelinkServer = new EelinkServer(
    processPositionUseCase,
    ensureTrackingDeviceUseCase,
    sendDeviceCommandUseCase,
    { port: eelinkPort },
    app.log,
  );
  const osmandServer = new OsmAndServer(processPositionUseCase, osmandPort, app.log);

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
