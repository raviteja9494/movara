import { FastifyInstance } from 'fastify';
import { registerDeviceRoutes } from './devices';
import { registerPositionRoutes } from './positions';
import { Gt06Server } from '../protocols/gt06/Gt06Server';
import { PrismaPositionRepository } from '../persistence/PrismaPositionRepository';
import { getPrismaClient } from '../../../../infrastructure/db';

export async function registerTrackingRoutes(app: FastifyInstance) {
  await registerDeviceRoutes(app);
  await registerPositionRoutes(app);

  // Start GT06 protocol server
  const prismaClient = getPrismaClient();
  const positionRepository = new PrismaPositionRepository(prismaClient);
  const gt06Server = new Gt06Server(positionRepository, 5051);

  app.addHook('onListen', async () => {
    try {
      await gt06Server.start();
      console.log('GT06 GPS tracker protocol server started');
    } catch (err) {
      console.error('Failed to start GT06 server:', err);
    }
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    try {
      await gt06Server.stop();
      console.log('GT06 server stopped');
    } catch (err) {
      console.error('Error stopping GT06 server:', err);
    }
  });
}
