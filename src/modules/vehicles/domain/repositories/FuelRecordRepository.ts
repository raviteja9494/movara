import { FuelRecord } from '../entities';

export interface FuelRecordRepository {
  create(record: FuelRecord): Promise<FuelRecord>;
  findByVehicleId(userId: string, vehicleId: string): Promise<FuelRecord[]>;
  findByIdForVehicle(userId: string, id: string, vehicleId: string): Promise<FuelRecord | null>;
  findLatestByVehicleId(userId: string, vehicleId: string): Promise<FuelRecord | null>;
  findDevicePositionAt(userId: string, deviceId: string, at: Date): Promise<{ latitude: number; longitude: number } | null>;
  update(userId: string, id: string, data: Partial<Pick<FuelRecord, 'date' | 'odometer' | 'fuelQuantity' | 'fuelCost' | 'fuelRate'>>): Promise<FuelRecord | null>;
  delete(userId: string, id: string): Promise<void>;
}
