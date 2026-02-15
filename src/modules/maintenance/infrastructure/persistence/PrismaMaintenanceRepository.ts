import { getPrismaClient } from '../../../../infrastructure/db';
import { MaintenanceRecord, MaintenanceType } from '../../domain/entities';
import { MaintenanceRepository } from '../../domain/repositories';

export class PrismaMaintenanceRepository implements MaintenanceRepository {
  async createRecord(record: MaintenanceRecord): Promise<MaintenanceRecord> {
    const prisma = getPrismaClient();
    const saved = await prisma.maintenanceRecord.create({
      data: {
        id: record.id,
        vehicleId: record.vehicleId,
        type: record.type,
        notes: record.notes,
        odometer: record.odometer,
        date: record.date,
        createdAt: record.createdAt,
        receiptPath: record.receiptPath,
      },
    });

    return new MaintenanceRecord(
      saved.id,
      saved.vehicleId,
      saved.type as MaintenanceType,
      saved.notes,
      saved.odometer,
      saved.date,
      saved.createdAt,
      saved.receiptPath ?? null,
    );
  }

  async getRecordsByVehicle(vehicleId: string): Promise<MaintenanceRecord[]> {
    const prisma = getPrismaClient();
    const records = await prisma.maintenanceRecord.findMany({
      where: { vehicleId },
      orderBy: { date: 'desc' },
    });

    return records.map(
      (r) =>
        new MaintenanceRecord(
          r.id,
          r.vehicleId,
          r.type as MaintenanceType,
          r.notes,
          r.odometer,
          r.date,
          r.createdAt,
          r.receiptPath ?? null,
        ),
    );
  }

  async updateReceiptPath(id: string, receiptPath: string | null): Promise<MaintenanceRecord | null> {
    const prisma = getPrismaClient();
    const saved = await prisma.maintenanceRecord.update({
      where: { id },
      data: { receiptPath },
    });
    return new MaintenanceRecord(
      saved.id,
      saved.vehicleId,
      saved.type as MaintenanceType,
      saved.notes,
      saved.odometer,
      saved.date,
      saved.createdAt,
      saved.receiptPath ?? null,
    );
  }

  async delete(id: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.maintenanceRecord.delete({ where: { id } });
  }
}
