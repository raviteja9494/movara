import { FuelRecord } from '../entities';

export interface FuelRecordRepository {
  create(record: FuelRecord): Promise<FuelRecord>;
  findByVehicleId(vehicleId: string): Promise<FuelRecord[]>;
  delete(id: string): Promise<void>;
}
