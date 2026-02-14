import { FastifyInstance } from 'fastify';
import { PrismaDeviceRepository } from '../persistence';
import { validate, PaginationQuerySchema } from '../../../../shared/validation';
import { getOffset, createPaginatedResponse } from '../../../../shared/utils';
import { getPrismaClient } from '../../../../infrastructure/db';

const deviceRepository = new PrismaDeviceRepository();

export async function registerDeviceRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>('/api/v1/devices', async (request) => {
    // Validate and parse pagination params with defaults
    // Throws ValidationError on failure - handled by global error handler
    const paginationParams = validate(request.query, PaginationQuerySchema);

    // Get total count and paginated data
    const prisma = getPrismaClient();
    const total = await prisma.device.count();
    const offset = getOffset(paginationParams.page, paginationParams.limit);

    const devices = await prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: paginationParams.limit,
    });

    return createPaginatedResponse(
      devices.map((d) => ({
        id: d.id,
        imei: d.imei,
        name: d.name,
        createdAt: d.createdAt,
      })),
      total,
      paginationParams.page,
      paginationParams.limit,
    );
  });
}
