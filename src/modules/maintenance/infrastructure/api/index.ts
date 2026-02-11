import { FastifyInstance } from 'fastify';
import { PrismaMaintenanceRepository } from '../persistence';
import { MaintenanceType } from '../../domain/entities';

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

  app.post<{
    Body: {
      vehicleId: string;
      type: MaintenanceType;
      date: string;
      notes?: string;
      odometer?: number;
    };
  }>('/api/v1/maintenance', async (request, reply) => {
    try {
      const { vehicleId, type, date, notes, odometer } = request.body;

      if (!vehicleId || !type || !date) {
        return reply.status(400).send({
          error: 'vehicleId, type, and date are required',
        });
      }

      const validTypes: MaintenanceType[] = [
        'service',
        'fuel',
        'repair',
        'inspection',
        'other',
      ];
      if (!validTypes.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${validTypes.join(', ')}`,
        });
      }

      const { MaintenanceRecord } = await import('../../domain/entities');
      const record = MaintenanceRecord.create(
        vehicleId,
        type,
        new Date(date),
        notes,
        odometer,
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
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        error: message,
      });
    }
  });
}
