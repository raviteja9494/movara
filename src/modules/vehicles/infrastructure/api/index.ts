import { FastifyInstance } from 'fastify';
import { PrismaVehicleRepository } from '../persistence';
import { validate, ValidationError, CreateVehicleSchema, PaginationQuerySchema } from '../../../../shared/validation';
import { getOffset, createPaginatedResponse } from '../../../../shared/utils';
import { getPrismaClient } from '../../../../infrastructure/db';

const vehicleRepository = new PrismaVehicleRepository();

export async function registerVehicleRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>('/api/v1/vehicles', async (request) => {
    // Validate and parse pagination params with defaults
    const paginationParams = validate(request.query, PaginationQuerySchema);

    // Get total count and paginated data
    const prisma = getPrismaClient();
    const total = await prisma.vehicle.count();
    const offset = getOffset(paginationParams.page, paginationParams.limit);

    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: paginationParams.limit,
    });

    return createPaginatedResponse(
      vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        createdAt: v.createdAt,
      })),
      total,
      paginationParams.page,
      paginationParams.limit,
    );
  });

  app.post<{ Body: unknown }>(
    '/api/v1/vehicles',
    async (request, reply) => {
      try {
        // Validate request body using shared validation layer
        const validatedData = validate(request.body, CreateVehicleSchema);

        const { Vehicle } = await import('../../domain/entities');
        const vehicle = Vehicle.create(validatedData.name, validatedData.description ?? undefined);
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
}
