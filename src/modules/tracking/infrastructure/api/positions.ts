import { FastifyInstance } from 'fastify';

export async function registerPositionRoutes(app: FastifyInstance) {
  app.get('/api/v1/positions/latest', async (request, reply) => {
    const { deviceId, limit = 10 } = request.query as {
      deviceId?: string;
      limit?: number;
    };

    if (!deviceId) {
      return reply.status(400).send({
        error: 'deviceId query parameter is required',
      });
    }

    const prisma = (await import('../../../../infrastructure/db')).getPrismaClient();
    const positions = await prisma.position.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      take: Math.min(Number(limit), 100),
    });

    return {
      positions: positions.map((p) => ({
        id: p.id,
        deviceId: p.deviceId,
        timestamp: p.timestamp,
        latitude: p.latitude,
        longitude: p.longitude,
        speed: p.speed,
        createdAt: p.createdAt,
      })),
    };
  });
}
