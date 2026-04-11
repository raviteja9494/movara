import { getPrismaClient } from '../../../../infrastructure/db';
import { MaintenanceRecord, MaintenanceType } from '../../domain/entities';
import { MaintenanceRepository } from '../../domain/repositories';

export class PrismaMaintenanceRepository implements MaintenanceRepository {
  async createRecord(record: MaintenanceRecord): Promise<MaintenanceRecord> {
    const prisma = getPrismaClient();
    const saved = await prisma.vehicleRecord.create({
      data: {
        id: record.id,
        vehicleId: record.vehicleId,
        type: 'maintenance',
        subtype: record.type,
        title: record.type === 'service' ? 'Service' : record.type === 'repair' ? 'Repair' : record.type === 'inspection' ? 'Inspection' : 'Maintenance record',
        notes: record.notes,
        odometer: record.odometer,
        amount: record.cost,
        date: record.date,
        createdAt: record.createdAt,
        attachmentPath: record.receiptPath,
      },
    });

    return new MaintenanceRecord(
      saved.id,
      saved.vehicleId,
      (saved.subtype ?? 'other') as MaintenanceType,
      saved.notes,
      saved.odometer,
      saved.amount,
      saved.date,
      saved.createdAt,
      saved.attachmentPath ?? null,
    );
  }

  async getRecordsByVehicle(vehicleId: string): Promise<MaintenanceRecord[]> {
    const prisma = getPrismaClient();
    const records = await prisma.vehicleRecord.findMany({
      where: { vehicleId, type: 'maintenance' },
      orderBy: { date: 'desc' },
    });

    return records.map(
      (r) =>
        new MaintenanceRecord(
          r.id,
          r.vehicleId,
          (r.subtype ?? 'other') as MaintenanceType,
          r.notes,
          r.odometer,
          r.amount,
          r.date,
          r.createdAt,
          r.attachmentPath ?? null,
        ),
    );
  }

  async updateRecord(
    id: string,
    data: Partial<Pick<MaintenanceRecord, 'type' | 'notes' | 'odometer' | 'cost' | 'date'>>,
  ): Promise<MaintenanceRecord | null> {
    const prisma = getPrismaClient();
    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) {
      updateData.subtype = data.type;
      updateData.title = data.type === 'service' ? 'Service' : data.type === 'repair' ? 'Repair' : data.type === 'inspection' ? 'Inspection' : 'Maintenance record';
    }
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.odometer !== undefined) updateData.odometer = data.odometer;
    if (data.cost !== undefined) updateData.amount = data.cost;
    if (data.date !== undefined) updateData.date = data.date;
    if (Object.keys(updateData).length === 0) return null;
    const saved = await prisma.vehicleRecord.update({
      where: { id },
      data: updateData,
    });
    return new MaintenanceRecord(
      saved.id,
      saved.vehicleId,
      (saved.subtype ?? 'other') as MaintenanceType,
      saved.notes,
      saved.odometer,
      saved.amount,
      saved.date,
      saved.createdAt,
      saved.attachmentPath ?? null,
    );
  }

  async updateReceiptPath(id: string, receiptPath: string | null): Promise<MaintenanceRecord | null> {
    const prisma = getPrismaClient();
    const saved = await prisma.vehicleRecord.update({
      where: { id },
      data: { attachmentPath: receiptPath },
    });
    return new MaintenanceRecord(
      saved.id,
      saved.vehicleId,
      (saved.subtype ?? 'other') as MaintenanceType,
      saved.notes,
      saved.odometer,
      saved.amount,
      saved.date,
      saved.createdAt,
      saved.attachmentPath ?? null,
    );
  }

  async delete(id: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.vehicleRecord.delete({ where: { id } });
  }
}
