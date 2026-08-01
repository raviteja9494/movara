import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate, PaginationQuerySchema, SendDeviceCommandSchema, UpdateDeviceSchema } from '../../../../shared/validation';
import { createPaginatedResponse } from '../../../../shared/utils';
import type { DeviceStateStore } from '../device/DeviceStateStore';
import { SendDeviceCommandUseCase } from '../../application/use-cases/SendDeviceCommandUseCase';
import type { DeviceUseCases } from '../../application/use-cases';
import { actingUserId } from '../../../../shared/authorization';

const ProvisionDeviceSchema = z.object({ imei: z.string().min(1).max(80), name: z.string().max(120).nullable().optional() });

export interface DeviceRouteDependencies {
  deviceUseCases: DeviceUseCases;
  sendDeviceCommandUseCase: SendDeviceCommandUseCase;
  deviceStateStore: DeviceStateStore;
}

export async function registerDeviceRoutes(
  app: FastifyInstance,
  dependencies: DeviceRouteDependencies,
) {
  const { deviceUseCases, sendDeviceCommandUseCase, deviceStateStore } = dependencies;
  const serializeDevice = async (d: { id: string; imei: string; name: string | null; createdAt: Date }) => {
    const state = await deviceStateStore.getSnapshot(d.imei);
    return {
      id: d.id,
      imei: d.imei,
      name: d.name,
      createdAt: d.createdAt,
      lastSeen: state.lastSeen?.toISOString() ?? null,
      status: state.status,
      protocol: state.protocol,
      lastAttributes: state.lastAttributes,
      packetAttributes: state.packetAttributes.map((snapshot) => ({
        packetId: snapshot.packetId,
        updatedAt: snapshot.updatedAt.toISOString(),
        attributes: snapshot.attributes,
      })),
    };
  };

  app.get<{ Querystring: unknown }>('/api/v1/devices', async (request) => {
    const paginationParams = validate(request.query, PaginationQuerySchema);
    const result = await deviceUseCases.list(actingUserId(request), paginationParams.page ?? 1, paginationParams.limit ?? 10);

    return createPaginatedResponse(
      await Promise.all(result.items.map((d) => serializeDevice(d))),
      result.total,
      paginationParams.page ?? 1,
      paginationParams.limit ?? 10,
    );
  });

  app.post<{ Body: unknown }>('/api/v1/devices', async (request, reply) => {
    const body = ProvisionDeviceSchema.parse(request.body ?? {});
    const device = await deviceUseCases.provision(actingUserId(request), body.imei, body.name);
    return reply.status(201).send({ device: await serializeDevice(device) });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/v1/devices/:id',
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body ?? {};
      const validated = validate(body, UpdateDeviceSchema);

      const existing = await deviceUseCases.get(actingUserId(request), id);
      const name = validated.name !== undefined ? validated.name : existing.name;
      const updated = await deviceUseCases.updateName(actingUserId(request), id, name);
      return reply.status(200).send({
        device: await serializeDevice(updated),
      });
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/devices/:id/commands/available', async (request) => {
    const userId = actingUserId(request);
    const existing = await deviceUseCases.get(userId, request.params.id);
    const available = await sendDeviceCommandUseCase.getAvailable(userId, request.params.id);
    return {
      device: await serializeDevice(existing),
      ...available,
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/devices/:id/commands', async (request) => {
    return {
      commands: (await sendDeviceCommandUseCase.listHistory(actingUserId(request), request.params.id)).map((command) => ({
        ...command,
        createdAt: command.createdAt.toISOString(),
        sentAt: command.sentAt?.toISOString() ?? null,
        respondedAt: command.respondedAt?.toISOString() ?? null,
        response: command.response ?? null,
      })),
    };
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/devices/:id/commands', async (request, reply) => {
    const validated = validate(request.body ?? {}, SendDeviceCommandSchema);
    const result = await sendDeviceCommandUseCase.execute(actingUserId(request), {
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
    await deviceUseCases.delete(actingUserId(request), request.params.id);
    return reply.status(204).send();
  });
}
