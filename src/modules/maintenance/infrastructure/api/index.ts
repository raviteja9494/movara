import { FastifyInstance } from 'fastify';
import { PrismaMaintenanceRepository } from '../persistence';
import { MaintenanceType } from '../../domain/entities';
import {
  validate,
  ValidationError,
  CreateMaintenanceSchema,
  PaginationQuerySchema,
} from '../../../../shared/validation';
import { getOffset, createPaginatedResponse } from '../../../../shared/utils';
import { getPrismaClient } from '../../../../infrastructure/db';

const maintenanceRepository = new PrismaMaintenanceRepository();

export async function registerMaintenanceRoutes(app: FastifyInstance) {
  app.get<{ Params: { vehicleId: string }; Querystring: unknown }>(
    '/api/v1/maintenance/:vehicleId',
    async (request, reply) => {
      try {
        const { vehicleId } = request.params;

        if (!vehicleId) {
          return reply.status(400).send({
            error: 'vehicleId is required',
          });
        }

        // Validate and parse pagination params with defaults
        const paginationParams = validate(request.query, PaginationQuerySchema);

        // Get total count and paginated data
        const prisma = getPrismaClient();
        const total = await prisma.maintenanceRecord.count({
          where: { vehicleId },
        });
        const offset = getOffset(paginationParams.page, paginationParams.limit);

        const records = await prisma.maintenanceRecord.findMany({
          where: { vehicleId },
          orderBy: { date: 'desc' },
          skip: offset,
          take: paginationParams.limit,
        });

        return createPaginatedResponse(
          records.map((r) => ({
            id: r.id,
            vehicleId: r.vehicleId,
            type: r.type,
            notes: r.notes,
            odometer: r.odometer,
            date: r.date,
            createdAt: r.createdAt,
          })),
          total,
          paginationParams.page,
          paginationParams.limit,
        );
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send(err.toJSON());
        }

        const message = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          error: message,
        });
      }
    },
  );

  app.post<{ Body: unknown }>('/api/v1/maintenance', async (request, reply) => {
    try {
      // Validate request body using shared validation layer
      const validatedData = validate(request.body, CreateMaintenanceSchema);

      const { MaintenanceRecord } = await import('../../domain/entities');
      const record = MaintenanceRecord.create(
        validatedData.vehicleId,
        validatedData.type as MaintenanceType,
        new Date(validatedData.date),
        validatedData.notes ?? undefined,
        validatedData.odometer ?? undefined,
      );

      const created = await maintenanceRepository.createRecord(record);

      return reply.status(201).send({
        record: {
          id: created.id,
          vehicleId: created.vehicleId,
          type: created.type,
          notes: created.notes,
          odometer: created.odometer,
          date: created.date,
          createdAt: created.createdAt,
        },
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send(err.toJSON());
      }

      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        error: message,
      });
    }
  });
}
