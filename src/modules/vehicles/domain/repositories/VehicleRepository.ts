import { Vehicle } from '../entities';

export interface VehicleRepository {
  createVehicle(vehicle: Vehicle): Promise<Vehicle>;
  findAllVehicles(): Promise<Vehicle[]>;
  findVehicleById(id: string): Promise<Vehicle | null>;
}
