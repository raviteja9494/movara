import { MaintenanceRecord } from '../entities';

export interface MaintenanceRepository {
  createRecord(record: MaintenanceRecord): Promise<MaintenanceRecord>;
  getRecordsByVehicle(vehicleId: string): Promise<MaintenanceRecord[]>;
  updateRecord(id: string, data: Partial<Pick<MaintenanceRecord, 'type' | 'notes' | 'odometer' | 'cost' | 'date'>>): Promise<MaintenanceRecord | null>;
  updateReceiptPath(id: string, receiptPath: string | null): Promise<MaintenanceRecord | null>;
  delete(id: string): Promise<void>;
}
