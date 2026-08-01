import type { PrismaClient } from '@prisma/client';
import { Vehicle } from '../../domain/entities';
import type {
  InsuranceUpdate,
  VehicleDetails,
  VehicleRepository,
  VehicleUpdate,
} from '../../domain/repositories';

function toVehicle(r: {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  licensePlate: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  currentOdometer: number | null;
  estimatedOdometerKm: number | null;
  estimatedOdometerBaseKm: number | null;
  estimatedOdometerBaseAt: Date | null;
  estimatedOdometerUpdatedAt: Date | null;
  fuelType: string | null;
  icon: string | null;
  photoPath: string | null;
  deviceId: string | null;
}): Vehicle {
  return new Vehicle(
    r.id,
    r.userId,
    r.name,
    r.description,
    r.createdAt,
    r.licensePlate,
    r.vin,
    r.year,
    r.make,
    r.model,
    r.currentOdometer,
    r.estimatedOdometerKm,
    r.estimatedOdometerBaseKm,
    r.estimatedOdometerBaseAt,
    r.estimatedOdometerUpdatedAt,
    r.fuelType,
    r.icon,
    r.photoPath ?? null,
    r.deviceId,
  );
}

export class PrismaVehicleRepository implements VehicleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createVehicle(vehicle: Vehicle): Promise<Vehicle> {
    const record = await this.prisma.vehicle.create({
      data: {
        id: vehicle.id,
        userId: vehicle.userId,
        name: vehicle.name,
        description: vehicle.description,
        createdAt: vehicle.createdAt,
        licensePlate: vehicle.licensePlate,
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        currentOdometer: vehicle.currentOdometer,
        estimatedOdometerKm: vehicle.estimatedOdometerKm,
        estimatedOdometerBaseKm: vehicle.estimatedOdometerBaseKm,
        estimatedOdometerBaseAt: vehicle.estimatedOdometerBaseAt,
        estimatedOdometerUpdatedAt: vehicle.estimatedOdometerUpdatedAt,
        fuelType: vehicle.fuelType,
        icon: vehicle.icon,
        photoPath: vehicle.photoPath,
        deviceId: vehicle.deviceId,
      },
    });
    return toVehicle(record);
  }

  async findVehicleById(userId: string, id: string): Promise<Vehicle | null> {
    const record = await this.prisma.vehicle.findFirst({ where: { id, userId } });
    if (!record) return null;
    return toVehicle(record);
  }

  async findVehicleDetailsById(userId: string, id: string): Promise<VehicleDetails | null> {
    const record = await this.prisma.vehicle.findFirst({
      where: { id, userId },
      include: { records: { where: { type: 'document', subtype: { in: ['insurance_third_party', 'insurance_own_damage'] } } } },
    });
    return record ? { vehicle: toVehicle(record), insuranceRecords: record.records } : null;
  }

  async listVehicleDetails(userId: string, offset: number, limit: number): Promise<{ items: VehicleDetails[]; total: number }> {
    const [total, records] = await Promise.all([
      this.prisma.vehicle.count({ where: { userId } }),
      this.prisma.vehicle.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: { records: { where: { type: 'document', subtype: { in: ['insurance_third_party', 'insurance_own_damage'] } } } },
      }),
    ]);
    return { items: records.map((record) => ({ vehicle: toVehicle(record), insuranceRecords: record.records })), total };
  }

  async updateVehicle(
    userId: string,
    id: string,
    data: VehicleUpdate,
  ): Promise<Vehicle | null> {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.licensePlate !== undefined) update.licensePlate = data.licensePlate;
    if (data.vin !== undefined) update.vin = data.vin;
    if (data.year !== undefined) update.year = data.year;
    if (data.make !== undefined) update.make = data.make;
    if (data.model !== undefined) update.model = data.model;
    if (data.currentOdometer !== undefined) update.currentOdometer = data.currentOdometer;
    if (data.estimatedOdometerKm !== undefined) update.estimatedOdometerKm = data.estimatedOdometerKm;
    if (data.estimatedOdometerBaseKm !== undefined) update.estimatedOdometerBaseKm = data.estimatedOdometerBaseKm;
    if (data.estimatedOdometerBaseAt !== undefined) update.estimatedOdometerBaseAt = data.estimatedOdometerBaseAt;
    if (data.estimatedOdometerUpdatedAt !== undefined) update.estimatedOdometerUpdatedAt = data.estimatedOdometerUpdatedAt;
    if (data.fuelType !== undefined) update.fuelType = data.fuelType;
    if (data.icon !== undefined) update.icon = data.icon;
    if (data.photoPath !== undefined) update.photoPath = data.photoPath;
    if (data.deviceId !== undefined) update.deviceId = data.deviceId;
    await this.prisma.vehicle.updateMany({ where: { id, userId }, data: update });
    const record = await this.prisma.vehicle.findFirst({ where: { id, userId } });
    return record ? toVehicle(record) : null;
  }

  async syncInsuranceRecords(userId: string, vehicleId: string, data: InsuranceUpdate): Promise<void> {
    const syncOne = async (
      subtype: 'insurance_third_party' | 'insurance_own_damage',
      title: string,
      payload: { start?: Date | null; end?: Date | null; provider?: string | null; number?: string | null },
    ) => {
      const existing = await this.prisma.vehicleRecord.findFirst({ where: { userId, vehicleId, type: 'document', subtype } });
      const validFrom = payload.start ?? existing?.validFrom ?? null;
      const validUntil = payload.end ?? existing?.validUntil ?? null;
      const provider = payload.provider ?? existing?.provider ?? null;
      const referenceNumber = payload.number ?? existing?.referenceNumber ?? null;
      if (!validFrom && !validUntil && !provider && !referenceNumber) {
        if (existing) await this.prisma.vehicleRecord.delete({ where: { id: existing.id } });
        return;
      }
      const updateData = {
        title,
        validFrom,
        validUntil,
        provider,
        referenceNumber,
        date: validFrom ?? validUntil ?? existing?.date ?? new Date(),
        reminderMode: validUntil ? 'on_date' : 'none',
        reminderDaysBefore: validUntil ? 30 : null,
      };
      if (existing) {
        await this.prisma.vehicleRecord.update({ where: { id: existing.id }, data: updateData });
      } else {
        await this.prisma.vehicleRecord.create({
          data: { id: crypto.randomUUID(), userId, vehicleId, type: 'document', subtype, ...updateData },
        });
      }
    };
    await syncOne('insurance_third_party', 'Third-party insurance', {
      start: data.thirdPartyInsuranceStart,
      end: data.thirdPartyInsuranceEnd,
      provider: data.thirdPartyInsuranceProvider,
      number: data.thirdPartyInsuranceNumber,
    });
    await syncOne('insurance_own_damage', 'Own damage insurance', {
      start: data.ownInsuranceStart,
      end: data.ownInsuranceEnd,
      provider: data.ownInsuranceProvider,
      number: data.ownInsuranceNumber,
    });
  }

  async savePhoto(userId: string, id: string, photo: { path: string; data: Buffer; mimeType: string; filename: string }): Promise<void> {
    await this.prisma.vehicle.updateMany({
      where: { id, userId },
      data: { photoPath: photo.path, photoData: photo.data, photoMimeType: photo.mimeType, photoFilename: photo.filename },
    });
  }

  async getPhoto(userId: string, id: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const record = await this.prisma.vehicle.findFirst({
      where: { id, userId },
      select: { photoData: true, photoMimeType: true },
    });
    return record?.photoData
      ? { data: Buffer.from(record.photoData), mimeType: record.photoMimeType ?? 'application/octet-stream' }
      : null;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.vehicle.deleteMany({ where: { id, userId } });
  }
}
