import { Vehicle } from '../entities';

export interface VehicleRepository {
  createVehicle(vehicle: Vehicle): Promise<Vehicle>;
  findAllVehicles(): Promise<Vehicle[]>;
  findVehicleById(id: string): Promise<Vehicle | null>;
  updateVehicle(id: string, data: {
    name?: string;
    description?: string | null;
    licensePlate?: string | null;
    vin?: string | null;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    currentOdometer?: number | null;
    estimatedOdometerKm?: number | null;
    estimatedOdometerBaseKm?: number | null;
    estimatedOdometerBaseAt?: Date | null;
    estimatedOdometerUpdatedAt?: Date | null;
    fuelType?: string | null;
    icon?: string | null;
    photoPath?: string | null;
    deviceId?: string | null;
  }): Promise<Vehicle | null>;
  delete(id: string): Promise<void>;
}
