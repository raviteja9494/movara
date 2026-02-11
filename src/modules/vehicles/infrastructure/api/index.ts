import { FastifyInstance } from 'fastify';
import { PrismaVehicleRepository } from '../persistence';

const vehicleRepository = new PrismaVehicleRepository();

export async function registerVehicleRoutes(app: FastifyInstance) {
  app.get('/api/v1/vehicles', async () => {
    const vehicles = await vehicleRepository.findAllVehicles();

    return {
      vehicles: vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        createdAt: v.createdAt,
      })),
    };
  });

  app.post<{ Body: { name: string; description?: string } }>(
    '/api/v1/vehicles',
    async (request, reply) => {
      try {
        const { name, description } = request.body;

        if (!name || name.trim().length === 0) {
          return reply.status(400).send({
            error: 'name is required and must not be empty',
          });
        }

        const { Vehicle } = await import('../../domain/entities');
        const vehicle = Vehicle.create(name, description);
        const created = await vehicleRepository.createVehicle(vehicle);

        return reply.status(201).send({
          vehicle: {
            id: created.id,
            name: created.name,
            description: created.description,
            createdAt: created.createdAt,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          error: message,
        });
      }
    },
  );
}
