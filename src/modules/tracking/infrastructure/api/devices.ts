import { FastifyInstance } from 'fastify';
import { PrismaDeviceRepository } from '../persistence';
import { validate, PaginationQuerySchema, SendDeviceCommandSchema, UpdateDeviceSchema } from '../../../../shared/validation';
import { getOffset, createPaginatedResponse } from '../../../../shared/utils';
import { getPrismaClient } from '../../../../infrastructure/db';
import { NotFoundError } from '../../../../shared/errors';
import { deviceStateStore } from '../device/DeviceStateStore';
import { SendDeviceCommandUseCase } from '../../application/use-cases/SendDeviceCommandUseCase';

const deviceRepository = new PrismaDeviceRepository();

export async function registerDeviceRoutes(app: FastifyInstance, sendDeviceCommandUseCase: SendDeviceCommandUseCase) {
  const serializeDevice = (d: { id: string; imei: string; name: string | null; createdAt: Date }) => ({
    id: d.id,
    imei: d.imei,
    name: d.name,
    createdAt: d.createdAt,
    lastSeen: deviceStateStore.getLastSeen(d.imei)?.toISOString() ?? null,
    status: deviceStateStore.getStatus(d.imei),
    protocol: deviceStateStore.getProtocol(d.imei),
    lastAttributes: deviceStateStore.getLastAttributes(d.imei),
    packetAttributes: deviceStateStore.getPacketAttributes(d.imei).map((snapshot) => ({
      packetId: snapshot.packetId,
      updatedAt: snapshot.updatedAt.toISOString(),
      attributes: snapshot.attributes,
    })),
  });

  app.get<{ Querystring: unknown }>('/api/v1/devices', async (request) => {
    const paginationParams = validate(request.query, PaginationQuerySchema);

    const prisma = getPrismaClient();
    const total = await prisma.device.count();
    const offset = getOffset(paginationParams.page ?? 1, paginationParams.limit ?? 10);

    const devices = await prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: paginationParams.limit,
    });

    return createPaginatedResponse(
      devices.map((d) => serializeDevice(d)),
      total,
      paginationParams.page ?? 1,
      paginationParams.limit ?? 10,
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
        device: serializeDevice(updated!),
      });
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/devices/:id/commands/available', async (request) => {
    const existing = await deviceRepository.findById(request.params.id);
    if (!existing) {
      throw new NotFoundError('Device', request.params.id);
    }
    const available = await sendDeviceCommandUseCase.getAvailable(request.params.id);
    return {
      device: serializeDevice(existing),
      ...available,
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/devices/:id/commands', async (request) => {
    const existing = await deviceRepository.findById(request.params.id);
    if (!existing) {
      throw new NotFoundError('Device', request.params.id);
    }
    return {
      commands: (await sendDeviceCommandUseCase.listHistory(request.params.id)).map((command) => ({
        ...command,
        createdAt: command.createdAt.toISOString(),
        sentAt: command.sentAt?.toISOString() ?? null,
        respondedAt: command.respondedAt?.toISOString() ?? null,
        response: command.response ?? null,
      })),
    };
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/devices/:id/commands', async (request, reply) => {
    const existing = await deviceRepository.findById(request.params.id);
    if (!existing) {
      throw new NotFoundError('Device', request.params.id);
    }
    const validated = validate(request.body ?? {}, SendDeviceCommandSchema);
    const result = await sendDeviceCommandUseCase.execute({
      deviceId: request.params.id,
      commandKey: validated.commandKey,
      values: validated.values ?? {},
    });
    return reply.status(200).send({
      command: {
        ...result,
        createdAt: result.createdAt.toISOString(),
        sentAt: result.sentAt?.toISOString() ?? null,
        respondedAt: result.respondedAt?.toISOString() ?? null,
        response: result.response ?? null,
      },
    });
  });

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
