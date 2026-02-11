import { getPrismaClient } from '../../../infrastructure/db';
import { Vehicle } from '../../domain/entities';
import { VehicleRepository } from '../../domain/repositories';

export class PrismaVehicleRepository implements VehicleRepository {
  async createVehicle(vehicle: Vehicle): Promise<Vehicle> {
    const prisma = getPrismaClient();
    const record = await prisma.vehicle.create({
      data: {
        id: vehicle.id,
        name: vehicle.name,
        description: vehicle.description,
        createdAt: vehicle.createdAt,
      },
    });

    return new Vehicle(
      record.id,
      record.name,
      record.description,
      record.createdAt,
    );
  }

  async findAllVehicles(): Promise<Vehicle[]> {
    const prisma = getPrismaClient();
    const records = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return records.map(
      (r) => new Vehicle(r.id, r.name, r.description, r.createdAt),
    );
  }

  async findVehicleById(id: string): Promise<Vehicle | null> {
    const prisma = getPrismaClient();
    const record = await prisma.vehicle.findUnique({ where: { id } });

    if (!record) return null;

    return new Vehicle(record.id, record.name, record.description, record.createdAt);
  }
}
