import type { PrismaClient } from '@prisma/client';
import { VehicleRecord } from '../../domain/entities';
import type { MaintenanceRepository, VehicleRecordUpdate } from '../../domain/repositories';

type RecordRow = {
  id: string; userId: string; vehicleId: string; type: string; subtype: string | null; title: string; notes: string | null;
  amount: number | null; odometer: number | null; date: Date; validFrom: Date | null; validUntil: Date | null;
  provider: string | null; referenceNumber: string | null; reminderMode: string; reminderDaysBefore: number | null;
  recurringIntervalDays: number | null; recurringIntervalKm: number | null; attachmentPath: string | null;
  createdAt: Date; updatedAt: Date; vehicle?: { name: string } | null;
};

function toDomain(row: RecordRow): VehicleRecord {
  return new VehicleRecord(
    row.id, row.userId, row.vehicleId, row.type, row.subtype, row.title, row.notes, row.amount, row.odometer,
    row.date, row.validFrom, row.validUntil, row.provider, row.referenceNumber, row.reminderMode,
    row.reminderDaysBefore, row.recurringIntervalDays, row.recurringIntervalKm, row.attachmentPath,
    row.createdAt, row.updatedAt, row.vehicle?.name ?? null,
  );
}

export class PrismaMaintenanceRepository implements MaintenanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, filters: { vehicleId?: string; type?: string }, offset: number, limit: number) {
    const where = { userId, ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}), ...(filters.type ? { type: filters.type } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.vehicleRecord.count({ where }),
      this.prisma.vehicleRecord.findMany({
        where, orderBy: { date: 'desc' }, skip: offset, take: limit,
        include: { vehicle: { select: { name: true } } },
      }),
    ]);
    return { items: rows.map(toDomain), total };
  }

  async findById(userId: string, id: string): Promise<VehicleRecord | null> {
    const row = await this.prisma.vehicleRecord.findFirst({
      where: { id, userId }, include: { vehicle: { select: { name: true } } },
    });
    return row ? toDomain(row) : null;
  }

  async create(record: VehicleRecord): Promise<VehicleRecord> {
    const row = await this.prisma.vehicleRecord.create({
      data: {
        id: record.id, userId: record.userId, vehicleId: record.vehicleId, type: record.type, subtype: record.subtype,
        title: record.title, notes: record.notes, amount: record.amount, odometer: record.odometer,
        date: record.date, validFrom: record.validFrom, validUntil: record.validUntil,
        provider: record.provider, referenceNumber: record.referenceNumber, reminderMode: record.reminderMode,
        reminderDaysBefore: record.reminderDaysBefore, recurringIntervalDays: record.recurringIntervalDays,
        recurringIntervalKm: record.recurringIntervalKm, createdAt: record.createdAt,
      },
    });
    return toDomain(row);
  }

  async update(userId: string, id: string, data: VehicleRecordUpdate): Promise<VehicleRecord> {
    const update: Record<string, unknown> = {};
    for (const key of [
      'type', 'subtype', 'title', 'notes', 'amount', 'odometer', 'date', 'validFrom', 'validUntil',
      'provider', 'referenceNumber', 'reminderMode', 'reminderDaysBefore', 'recurringIntervalDays', 'recurringIntervalKm',
    ] as const) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    await this.prisma.vehicleRecord.updateMany({ where: { id, userId }, data: update });
    const row = await this.prisma.vehicleRecord.findFirstOrThrow({ where: { id, userId } });
    return toDomain(row);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.vehicleRecord.deleteMany({ where: { id, userId } });
  }

  async saveAttachment(userId: string, id: string, attachment: { path: string; data: Buffer; mimeType: string; filename: string }) {
    await this.prisma.vehicleRecord.updateMany({
      where: { id, userId },
      data: {
        attachmentPath: attachment.path, attachmentData: attachment.data,
        attachmentMimeType: attachment.mimeType, attachmentFilename: attachment.filename,
      },
    });
    const row = await this.prisma.vehicleRecord.findFirstOrThrow({ where: { id, userId } });
    return toDomain(row);
  }

  async getAttachment(userId: string, id: string) {
    const row = await this.prisma.vehicleRecord.findFirst({
      where: { id, userId },
      select: { attachmentPath: true, attachmentData: true, attachmentMimeType: true },
    });
    return row?.attachmentData ? {
      path: row.attachmentPath ?? '', data: Buffer.from(row.attachmentData),
      mimeType: row.attachmentMimeType ?? 'application/octet-stream',
    } : null;
  }

  async findReminderRecords(userId: string, vehicleId: string): Promise<VehicleRecord[]> {
    const rows = await this.prisma.vehicleRecord.findMany({
      where: { userId, vehicleId, reminderMode: { not: 'none' } },
      orderBy: [{ validUntil: 'asc' }, { date: 'desc' }],
    });
    return rows.map(toDomain);
  }
}
