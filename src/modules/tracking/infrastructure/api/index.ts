import { FastifyInstance } from 'fastify';
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
import { HomeAssistantPublisher } from '../../../../infrastructure/homeAssistant';

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
  const homeAssistantPublisher = new HomeAssistantPublisher(app.log);
  eventDispatcher.subscribe('position.recorded', (evt) => autoTripOnIgnitionSubscriber.handle(evt as any));
  eventDispatcher.subscribe('device.telemetry', (evt) => autoTripOnIgnitionSubscriber.handleTelemetry(evt as any));
  eventDispatcher.subscribe('position.recorded', (evt) => homeAssistantPublisher.syncFromPositionEvent(evt as any));
  eventDispatcher.subscribe('device.telemetry', (evt) => homeAssistantPublisher.syncFromTelemetryEvent(evt as any));
  eventDispatcher.subscribe('device.online', (evt) => homeAssistantPublisher.syncFromPresenceEvent(evt as any, true));
  eventDispatcher.subscribe('device.offline', (evt) => homeAssistantPublisher.syncFromPresenceEvent(evt as any, false));
  if (homeAssistantPublisher.isEnabled()) app.log.info('Home Assistant publisher enabled');
  const processPositionUseCase = new ProcessIncomingPositionUseCase(positionRepository, deviceRepository);
  const ensureTrackingDeviceUseCase = new EnsureTrackingDeviceUseCase(deviceRepository);
  const sendDeviceCommandUseCase = new SendDeviceCommandUseCase();
  await registerDeviceRoutes(app, sendDeviceCommandUseCase);
  await registerPositionRoutes(app);

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
  const gt06Server = new Gt06Server(processPositionUseCase, ensureTrackingDeviceUseCase, gt06Port, app.log);
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
