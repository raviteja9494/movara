import { getPrismaClient } from '../../../../infrastructure/db';
import { Vehicle } from '../../domain/entities';
import { VehicleRepository } from '../../domain/repositories';

function toVehicle(r: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  licensePlate: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  currentOdometer: number | null;
  fuelType: string | null;
  icon: string | null;
  deviceId: string | null;
}): Vehicle {
  return new Vehicle(
    r.id,
    r.name,
    r.description,
    r.createdAt,
    r.licensePlate,
    r.vin,
    r.year,
    r.make,
    r.model,
    r.currentOdometer,
    r.fuelType,
    r.icon,
    r.deviceId,
  );
}

export class PrismaVehicleRepository implements VehicleRepository {
  async createVehicle(vehicle: Vehicle): Promise<Vehicle> {
    const prisma = getPrismaClient();
    const record = await prisma.vehicle.create({
      data: {
        id: vehicle.id,
        name: vehicle.name,
        description: vehicle.description,
        createdAt: vehicle.createdAt,
        licensePlate: vehicle.licensePlate,
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        currentOdometer: vehicle.currentOdometer,
        fuelType: vehicle.fuelType,
        icon: vehicle.icon,
        deviceId: vehicle.deviceId,
      },
    });
    return toVehicle(record);
  }

  async findAllVehicles(): Promise<Vehicle[]> {
    const prisma = getPrismaClient();
    const records = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toVehicle);
  }

  async findVehicleById(id: string): Promise<Vehicle | null> {
    const prisma = getPrismaClient();
    const record = await prisma.vehicle.findUnique({ where: { id } });
    if (!record) return null;
    return toVehicle(record);
  }

  async updateVehicle(
    id: string,
    data: { deviceId?: string | null; icon?: string | null }
  ): Promise<Vehicle | null> {
    const prisma = getPrismaClient();
    const record = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(data.deviceId !== undefined && { deviceId: data.deviceId }),
        ...(data.icon !== undefined && { icon: data.icon }),
      },
    });
    return toVehicle(record);
  }

  async delete(id: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.vehicle.delete({ where: { id } });
  }
}
