import { MaintenanceRecord } from '../entities';

export interface MaintenanceRepository {
  createRecord(record: MaintenanceRecord): Promise<MaintenanceRecord>;
  getRecordsByVehicle(vehicleId: string): Promise<MaintenanceRecord[]>;
}
