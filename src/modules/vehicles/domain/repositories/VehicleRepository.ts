import { Vehicle } from '../entities';

export interface VehicleRepository {
  createVehicle(vehicle: Vehicle): Promise<Vehicle>;
  findAllVehicles(): Promise<Vehicle[]>;
  findVehicleById(id: string): Promise<Vehicle | null>;
  updateVehicle(id: string, data: { deviceId?: string | null; icon?: string | null }): Promise<Vehicle | null>;
  delete(id: string): Promise<void>;
}
