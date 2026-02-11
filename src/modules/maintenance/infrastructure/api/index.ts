import { FastifyInstance } from 'fastify';
import { PrismaMaintenanceRepository } from '../persistence';
import { MaintenanceType } from '../../domain/entities';
import {
  validate,
  ValidationError,
  CreateMaintenanceSchema,
} from '../../../../shared/validation';

const maintenanceRepository = new PrismaMaintenanceRepository();

export async function registerMaintenanceRoutes(app: FastifyInstance) {
  app.get('/api/v1/maintenance/:vehicleId', async (request, reply) => {
    try {
      const { vehicleId } = request.params as { vehicleId: string };

      if (!vehicleId) {
        return reply.status(400).send({
          error: 'vehicleId is required',
        });
      }

      const records = await maintenanceRepository.getRecordsByVehicle(vehicleId);

      return {
        records: records.map((r) => ({
          id: r.id,
          vehicleId: r.vehicleId,
          type: r.type,
          notes: r.notes,
          odometer: r.odometer,
          date: r.date,
          createdAt: r.createdAt,
        })),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        error: message,
      });
    }
  });

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
