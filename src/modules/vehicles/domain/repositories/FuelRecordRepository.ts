import { FuelRecord } from '../entities';

export interface FuelRecordRepository {
  create(record: FuelRecord): Promise<FuelRecord>;
  findByVehicleId(vehicleId: string): Promise<FuelRecord[]>;
  update(id: string, data: Partial<Pick<FuelRecord, 'date' | 'odometer' | 'fuelQuantity' | 'fuelCost' | 'fuelRate'>>): Promise<FuelRecord | null>;
  delete(id: string): Promise<void>;
}
