import { FastifyInstance } from 'fastify';
import { registerDeviceRoutes } from './devices';
import { registerPositionRoutes } from './positions';
import { Gt06Server } from '../protocols/gt06/Gt06Server';
import { ProcessIncomingPositionUseCase } from '../../application/use-cases/ProcessIncomingPositionUseCase';
import { PrismaPositionRepository } from '../persistence/PrismaPositionRepository';
import { getPrismaClient } from '../../../../infrastructure/db';
import { InMemoryWebhookRepository } from '../../../../infrastructure/webhooks/InMemoryWebhookRepository';
import { WebhookDispatcher } from '../../../../infrastructure/webhooks/WebhookDispatcher';
import { eventDispatcher } from '../../../../../shared/utils';

export async function registerTrackingRoutes(app: FastifyInstance) {
  await registerDeviceRoutes(app);
  await registerPositionRoutes(app);

  // Start GT06 protocol server
  const prismaClient = getPrismaClient();
  const positionRepository = new PrismaPositionRepository(prismaClient);
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
  const processPositionUseCase = new ProcessIncomingPositionUseCase(positionRepository);
  const gt06Server = new Gt06Server(processPositionUseCase, 5051, app.log);

  app.addHook('onListen', async () => {
    try {
      await gt06Server.start();
      app.log.info('GT06 GPS tracker protocol server started');
    } catch (err) {
      app.log.error('Failed to start GT06 server:', err);
    }
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    try {
      await gt06Server.stop();
      app.log.info('GT06 server stopped');
    } catch (err) {
      app.log.error('Error stopping GT06 server:', err);
    }
  });
}
