import { FastifyInstance } from 'fastify';
import { PrismaDeviceRepository } from '../persistence';
import { validate, PaginationQuerySchema, UpdateDeviceSchema } from '../../../../shared/validation';
import { getOffset, createPaginatedResponse } from '../../../../shared/utils';
import { getPrismaClient } from '../../../../infrastructure/db';
import { NotFoundError } from '../../../../shared/errors';

const deviceRepository = new PrismaDeviceRepository();

export async function registerDeviceRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>('/api/v1/devices', async (request) => {
    const paginationParams = validate(request.query, PaginationQuerySchema);

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

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/v1/devices/:id',
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body ?? {};
      const validated = validate(body, UpdateDeviceSchema);

      const existing = await deviceRepository.findById(id);
      if (!existing) {
        throw new NotFoundError('Device', id);
      }

      const name = validated.name !== undefined ? validated.name : existing.name;
      const updated = await deviceRepository.updateName(id, name);
      return reply.status(200).send({
        device: {
          id: updated!.id,
          imei: updated!.imei,
          name: updated!.name,
          createdAt: updated!.createdAt,
        },
      });
    },
  );

  app.delete<{ Params: { id: string } }>('/api/v1/devices/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = await deviceRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Device', id);
    }
    await deviceRepository.delete(id);
    return reply.status(204).send();
  });
}
