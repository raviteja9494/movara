import { getPrismaClient } from '../../../../infrastructure/db';
import { FuelRecord } from '../../domain/entities';
import { FuelRecordRepository } from '../../domain/repositories';

function toFuelRecord(r: {
  id: string;
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
  async create(record: FuelRecord): Promise<FuelRecord> {
    const prisma = getPrismaClient();
    const r = await prisma.fuelRecord.create({
      data: {
        id: record.id,
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

  async findByVehicleId(vehicleId: string): Promise<FuelRecord[]> {
    const prisma = getPrismaClient();
    const records = await prisma.fuelRecord.findMany({
      where: { vehicleId },
      orderBy: { date: 'desc' },
    });
    return records.map(toFuelRecord);
  }

  async update(
    id: string,
    data: Partial<Pick<FuelRecord, 'date' | 'odometer' | 'fuelQuantity' | 'fuelCost' | 'fuelRate'>>,
  ): Promise<FuelRecord | null> {
    const prisma = getPrismaClient();
    const updateData: Record<string, unknown> = {};
    if (data.date !== undefined) updateData.date = data.date;
    if (data.odometer !== undefined) updateData.odometer = data.odometer;
    if (data.fuelQuantity !== undefined) updateData.fuelQuantity = data.fuelQuantity;
    if (data.fuelCost !== undefined) updateData.fuelCost = data.fuelCost;
    if (data.fuelRate !== undefined) updateData.fuelRate = data.fuelRate;
    if (Object.keys(updateData).length === 0) return null;
    const r = await prisma.fuelRecord.update({
      where: { id },
      data: updateData,
    });
    return toFuelRecord(r);
  }

  async delete(id: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.fuelRecord.delete({ where: { id } });
  }
}
