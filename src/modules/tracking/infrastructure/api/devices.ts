import { FastifyInstance } from 'fastify';
import { PrismaDeviceRepository } from '../persistence';

const deviceRepository = new PrismaDeviceRepository();

export async function registerDeviceRoutes(app: FastifyInstance) {
  app.get('/api/v1/devices', async () => {
    const prisma = (await import('../../../infrastructure/db')).getPrismaClient();
    const devices = await prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return {
      devices: devices.map((d) => ({
        id: d.id,
        imei: d.imei,
        name: d.name,
        createdAt: d.createdAt,
      })),
    };
  });
}
