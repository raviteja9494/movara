import { Vehicle } from '../entities';

export interface InsuranceRecord {
  subtype: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  provider: string | null;
  referenceNumber: string | null;
}

export interface VehicleDetails {
  vehicle: Vehicle;
  insuranceRecords: InsuranceRecord[];
}

export interface VehiclePhoto {
  data: Buffer;
  mimeType: string;
}

export interface InsuranceUpdate {
  thirdPartyInsuranceStart?: Date | null;
  thirdPartyInsuranceEnd?: Date | null;
  thirdPartyInsuranceProvider?: string | null;
  thirdPartyInsuranceNumber?: string | null;
  ownInsuranceStart?: Date | null;
  ownInsuranceEnd?: Date | null;
  ownInsuranceProvider?: string | null;
  ownInsuranceNumber?: string | null;
}

export type VehicleUpdate = {
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
};

export interface VehicleRepository {
  createVehicle(vehicle: Vehicle): Promise<Vehicle>;
  findVehicleById(userId: string, id: string): Promise<Vehicle | null>;
  findVehicleDetailsById(userId: string, id: string): Promise<VehicleDetails | null>;
  listVehicleDetails(userId: string, offset: number, limit: number): Promise<{ items: VehicleDetails[]; total: number }>;
  updateVehicle(userId: string, id: string, data: VehicleUpdate): Promise<Vehicle | null>;
  syncInsuranceRecords(userId: string, vehicleId: string, data: InsuranceUpdate): Promise<void>;
  savePhoto(userId: string, id: string, photo: { path: string; data: Buffer; mimeType: string; filename: string }): Promise<void>;
  getPhoto(userId: string, id: string): Promise<VehiclePhoto | null>;
  delete(userId: string, id: string): Promise<void>;
}
