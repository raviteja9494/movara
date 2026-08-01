import type { PrismaClient } from '@prisma/client';
import { FuelRecord } from '../../domain/entities';
import { FuelRecordRepository } from '../../domain/repositories';

function toFuelRecord(r: {
  id: string;
  userId: string;
  vehicleId: string;
  date: Date;
  odometer: number;
  fuelQuantity: number;
  fuelCost: number | null;
  fuelRate: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
}): FuelRecord {
  return new FuelRecord(
    r.id,
    r.userId,
    r.vehicleId,
    r.date,
    r.odometer,
    r.fuelQuantity,
    r.fuelCost,
    r.fuelRate,
    r.latitude,
    r.longitude,
    r.createdAt,
  );
}

export class PrismaFuelRecordRepository implements FuelRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(record: FuelRecord): Promise<FuelRecord> {
    const r = await this.prisma.fuelRecord.create({
      data: {
        id: record.id,
        userId: record.userId,
        vehicleId: record.vehicleId,
        date: record.date,
        odometer: record.odometer,
        fuelQuantity: record.fuelQuantity,
        fuelCost: record.fuelCost,
        fuelRate: record.fuelRate,
        latitude: record.latitude,
        longitude: record.longitude,
        createdAt: record.createdAt,
      },
    });
    return toFuelRecord(r);
  }

  async findByVehicleId(userId: string, vehicleId: string): Promise<FuelRecord[]> {
    const records = await this.prisma.fuelRecord.findMany({
      where: { userId, vehicleId },
      orderBy: { date: 'desc' },
    });
    return records.map(toFuelRecord);
  }

  async findByIdForVehicle(userId: string, id: string, vehicleId: string): Promise<FuelRecord | null> {
    const record = await this.prisma.fuelRecord.findFirst({ where: { userId, id, vehicleId } });
    return record ? toFuelRecord(record) : null;
  }

  async findLatestByVehicleId(userId: string, vehicleId: string): Promise<FuelRecord | null> {
    const record = await this.prisma.fuelRecord.findFirst({
      where: { userId, vehicleId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return record ? toFuelRecord(record) : null;
  }

  async findDevicePositionAt(userId: string, deviceId: string, at: Date): Promise<{ latitude: number; longitude: number } | null> {
    const position = await this.prisma.position.findFirst({
      where: { userId, deviceId, timestamp: { lte: at } },
      orderBy: { timestamp: 'desc' },
      select: { latitude: true, longitude: true },
    });
    return position;
  }

  async update(
    userId: string,
    id: string,
    data: Partial<Pick<FuelRecord, 'date' | 'odometer' | 'fuelQuantity' | 'fuelCost' | 'fuelRate'>>,
  ): Promise<FuelRecord | null> {
    const updateData: Record<string, unknown> = {};
    if (data.date !== undefined) updateData.date = data.date;
    if (data.odometer !== undefined) updateData.odometer = data.odometer;
    if (data.fuelQuantity !== undefined) updateData.fuelQuantity = data.fuelQuantity;
    if (data.fuelCost !== undefined) updateData.fuelCost = data.fuelCost;
    if (data.fuelRate !== undefined) updateData.fuelRate = data.fuelRate;
    if (Object.keys(updateData).length === 0) return null;
    await this.prisma.fuelRecord.updateMany({ where: { id, userId }, data: updateData });
    const record = await this.prisma.fuelRecord.findFirst({ where: { id, userId } });
    return record ? toFuelRecord(record) : null;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.fuelRecord.deleteMany({ where: { id, userId } });
  }
}
