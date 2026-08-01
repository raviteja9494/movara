import type { VehicleRecord } from '../entities';

type UpdatableVehicleRecordKey = 'type' | 'subtype' | 'title' | 'notes' | 'amount' | 'odometer' |
  'date' | 'validFrom' | 'validUntil' | 'provider' | 'referenceNumber' | 'reminderMode' |
  'reminderDaysBefore' | 'recurringIntervalDays' | 'recurringIntervalKm';

export type VehicleRecordUpdate = {
  -readonly [Key in UpdatableVehicleRecordKey]?: VehicleRecord[Key];
};

export interface RecordAttachment {
  path: string;
  data: Buffer;
  mimeType: string;
}

export interface MaintenanceRepository {
  list(userId: string, filters: { vehicleId?: string; type?: string }, offset: number, limit: number): Promise<{ items: VehicleRecord[]; total: number }>;
  findById(userId: string, id: string): Promise<VehicleRecord | null>;
  create(record: VehicleRecord): Promise<VehicleRecord>;
  update(userId: string, id: string, data: VehicleRecordUpdate): Promise<VehicleRecord>;
  delete(userId: string, id: string): Promise<void>;
  saveAttachment(userId: string, id: string, attachment: RecordAttachment & { filename: string }): Promise<VehicleRecord>;
  getAttachment(userId: string, id: string): Promise<RecordAttachment | null>;
  findReminderRecords(userId: string, vehicleId: string): Promise<VehicleRecord[]>;
}
