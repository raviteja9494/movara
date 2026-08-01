import { NotFoundError } from '../../../../shared/errors';
import { VehicleRecord, type MaintenanceType, type VehicleRecordProps } from '../../domain/entities';
import type { MaintenanceRepository, VehicleRecordUpdate } from '../../domain/repositories';
import type { OwnershipPolicy } from '../../../../shared/authorization';

export class MaintenanceUseCases {
  constructor(private readonly records: MaintenanceRepository, private readonly ownership: OwnershipPolicy) {}

  async list(userId: string, filters: { vehicleId?: string; type?: string }, page: number, limit: number) {
    this.ownership.requireActor(userId);
    if (filters.vehicleId) await this.ownership.assertOwns(userId, 'vehicle', filters.vehicleId);
    return this.records.list(userId, filters, (page - 1) * limit, limit);
  }

  async create(userId: string, input: Omit<VehicleRecordProps, 'userId'>) {
    await this.ownership.assertOwns(userId, 'vehicle', input.vehicleId);
    return this.records.create(VehicleRecord.create({ ...input, userId }));
  }

  async update(userId: string, id: string, input: VehicleRecordUpdate): Promise<VehicleRecord> {
    await this.ownership.assertOwns(userId, 'vehicleRecord', id);
    const existing = await this.records.findById(userId, id);
    if (!existing) throw new NotFoundError('VehicleRecord', id);
    return Object.keys(input).length === 0 ? existing : this.records.update(userId, id, input);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.ownership.assertOwns(userId, 'vehicleRecord', id);
    await this.records.delete(userId, id);
  }

  async saveAttachment(userId: string, id: string, attachment: { path: string; data: Buffer; mimeType: string; filename: string }) {
    await this.ownership.assertOwns(userId, 'vehicleRecord', id);
    return this.records.saveAttachment(userId, id, attachment);
  }

  async getAttachment(userId: string, id: string) {
    await this.ownership.assertOwns(userId, 'vehicleRecord', id);
    return this.records.getAttachment(userId, id);
  }

  listMaintenance(userId: string, vehicleId: string | undefined, page: number, limit: number) {
    return this.list(userId, { type: 'maintenance', ...(vehicleId ? { vehicleId } : {}) }, page, limit);
  }

  createMaintenance(userId: string, input: {
    vehicleId: string; type: MaintenanceType; date: Date; notes?: string | null;
    odometer?: number | null; cost?: number | null;
  }) {
    return this.create(userId, {
      vehicleId: input.vehicleId, type: 'maintenance', subtype: input.type,
      title: VehicleRecord.defaultTitle('maintenance', input.type), notes: input.notes,
      amount: input.cost, odometer: input.odometer, date: input.date,
    });
  }

  async updateMaintenance(userId: string, id: string, input: {
    type?: MaintenanceType; date?: Date; notes?: string | null; odometer?: number | null; cost?: number | null;
  }) {
    await this.ownership.assertOwns(userId, 'vehicleRecord', id);
    const existing = await this.records.findById(userId, id);
    if (!existing || existing.type !== 'maintenance') throw new NotFoundError('MaintenanceRecord', id);
    const update: VehicleRecordUpdate = {};
    if (input.type !== undefined) {
      update.subtype = input.type;
      update.title = VehicleRecord.defaultTitle('maintenance', input.type);
    }
    if (input.date !== undefined) update.date = input.date;
    if (input.notes !== undefined) update.notes = input.notes;
    if (input.odometer !== undefined) update.odometer = input.odometer;
    if (input.cost !== undefined) update.amount = input.cost;
    return Object.keys(update).length === 0 ? existing : this.records.update(userId, id, update);
  }

  async deleteMaintenance(userId: string, id: string): Promise<void> {
    await this.ownership.assertOwns(userId, 'vehicleRecord', id);
    const existing = await this.records.findById(userId, id);
    if (!existing || existing.type !== 'maintenance') throw new NotFoundError('MaintenanceRecord', id);
    await this.records.delete(userId, id);
  }
}
