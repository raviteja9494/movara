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
  photoPath: string | null;
  deviceId: string | null;
  thirdPartyInsuranceStart: Date | null;
  thirdPartyInsuranceEnd: Date | null;
  thirdPartyInsuranceProvider: string | null;
  thirdPartyInsuranceNumber: string | null;
  ownInsuranceStart: Date | null;
  ownInsuranceEnd: Date | null;
  ownInsuranceProvider: string | null;
  ownInsuranceNumber: string | null;
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
    r.photoPath ?? null,
    r.deviceId,
    r.thirdPartyInsuranceStart ?? null,
    r.thirdPartyInsuranceEnd ?? null,
    r.thirdPartyInsuranceProvider ?? null,
    r.thirdPartyInsuranceNumber ?? null,
    r.ownInsuranceStart ?? null,
    r.ownInsuranceEnd ?? null,
    r.ownInsuranceProvider ?? null,
    r.ownInsuranceNumber ?? null,
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
        photoPath: vehicle.photoPath,
        deviceId: vehicle.deviceId,
        thirdPartyInsuranceStart: vehicle.thirdPartyInsuranceStart,
        thirdPartyInsuranceEnd: vehicle.thirdPartyInsuranceEnd,
        thirdPartyInsuranceProvider: vehicle.thirdPartyInsuranceProvider,
        thirdPartyInsuranceNumber: vehicle.thirdPartyInsuranceNumber,
        ownInsuranceStart: vehicle.ownInsuranceStart,
        ownInsuranceEnd: vehicle.ownInsuranceEnd,
        ownInsuranceProvider: vehicle.ownInsuranceProvider,
        ownInsuranceNumber: vehicle.ownInsuranceNumber,
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
    data: {
      name?: string;
      description?: string | null;
      licensePlate?: string | null;
      vin?: string | null;
      year?: number | null;
      make?: string | null;
      model?: string | null;
      currentOdometer?: number | null;
      fuelType?: string | null;
      icon?: string | null;
      photoPath?: string | null;
      deviceId?: string | null;
      thirdPartyInsuranceStart?: Date | null;
      thirdPartyInsuranceEnd?: Date | null;
      thirdPartyInsuranceProvider?: string | null;
      thirdPartyInsuranceNumber?: string | null;
      ownInsuranceStart?: Date | null;
      ownInsuranceEnd?: Date | null;
      ownInsuranceProvider?: string | null;
      ownInsuranceNumber?: string | null;
    }
  ): Promise<Vehicle | null> {
    const prisma = getPrismaClient();
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.licensePlate !== undefined) update.licensePlate = data.licensePlate;
    if (data.vin !== undefined) update.vin = data.vin;
    if (data.year !== undefined) update.year = data.year;
    if (data.make !== undefined) update.make = data.make;
    if (data.model !== undefined) update.model = data.model;
    if (data.currentOdometer !== undefined) update.currentOdometer = data.currentOdometer;
    if (data.fuelType !== undefined) update.fuelType = data.fuelType;
    if (data.icon !== undefined) update.icon = data.icon;
    if (data.photoPath !== undefined) update.photoPath = data.photoPath;
    if (data.deviceId !== undefined) update.deviceId = data.deviceId;
    if (data.thirdPartyInsuranceStart !== undefined) update.thirdPartyInsuranceStart = data.thirdPartyInsuranceStart;
    if (data.thirdPartyInsuranceEnd !== undefined) update.thirdPartyInsuranceEnd = data.thirdPartyInsuranceEnd;
    if (data.thirdPartyInsuranceProvider !== undefined) update.thirdPartyInsuranceProvider = data.thirdPartyInsuranceProvider;
    if (data.thirdPartyInsuranceNumber !== undefined) update.thirdPartyInsuranceNumber = data.thirdPartyInsuranceNumber;
    if (data.ownInsuranceStart !== undefined) update.ownInsuranceStart = data.ownInsuranceStart;
    if (data.ownInsuranceEnd !== undefined) update.ownInsuranceEnd = data.ownInsuranceEnd;
    if (data.ownInsuranceProvider !== undefined) update.ownInsuranceProvider = data.ownInsuranceProvider;
    if (data.ownInsuranceNumber !== undefined) update.ownInsuranceNumber = data.ownInsuranceNumber;
    const record = await prisma.vehicle.update({
      where: { id },
      data: update,
    });
    return toVehicle(record);
  }

  async delete(id: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.vehicle.delete({ where: { id } });
  }
}
