import { MaintenanceRecord } from '../entities';

export interface MaintenanceRepository {
  createRecord(record: MaintenanceRecord): Promise<MaintenanceRecord>;
  getRecordsByVehicle(vehicleId: string): Promise<MaintenanceRecord[]>;
  updateReceiptPath(id: string, receiptPath: string | null): Promise<MaintenanceRecord | null>;
  delete(id: string): Promise<void>;
}
