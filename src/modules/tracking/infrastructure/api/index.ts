import { FastifyInstance } from 'fastify';
import { registerDeviceRoutes } from './devices';
import { registerPositionRoutes } from './positions';
import { Gt06Server } from '../protocols/gt06/Gt06Server';
import { OsmAndServer } from '../protocols/osmand/OsmAndServer';
import { ProcessIncomingPositionUseCase } from '../../application/use-cases/ProcessIncomingPositionUseCase';
import { PrismaPositionRepository } from '../persistence/PrismaPositionRepository';
import { InMemoryWebhookRepository } from '../../../../infrastructure/webhooks/InMemoryWebhookRepository';
import { PrismaDeviceRepository } from '../persistence/PrismaDeviceRepository';
import { WebhookDispatcher } from '../../../../infrastructure/webhooks/WebhookDispatcher';
import { eventDispatcher } from '../../../../shared/utils';

export async function registerTrackingRoutes(app: FastifyInstance) {
  await registerDeviceRoutes(app);
  await registerPositionRoutes(app);

  // Start GT06 protocol server
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
  const processPositionUseCase = new ProcessIncomingPositionUseCase(positionRepository, deviceRepository);
  const gt06Server = new Gt06Server(processPositionUseCase, 5051, app.log);
  const osmandServer = new OsmAndServer(processPositionUseCase, 5055, app.log);

  app.addHook('onListen', async () => {
    try {
      await gt06Server.start();
      app.log.info('GT06 GPS tracker protocol server started on port 5051');
    } catch (err: unknown) {
      app.log.error({ err }, 'Failed to start GT06 server');
    }
    try {
      await osmandServer.start();
      app.log.info('OsmAnd protocol server started on port 5055 (Traccar Client compatible)');
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
      await osmandServer.stop();
      app.log.info('OsmAnd server stopped');
    } catch (err: unknown) {
      app.log.error({ err }, 'Error stopping OsmAnd server');
    }
  });
}
