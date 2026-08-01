export interface TravelPoint {
  latitude: number;
  longitude: number;
  timestamp: Date;
  speed: number | null;
}

export interface StoredVehicleTrip {
  id: string;
  source: string;
  deviceId: string | null;
  startTime: Date;
  endTime: Date;
}

export interface VehicleTripMerge {
  id: string;
  deviceId: string;
  gapAfter: Date;
  gapBefore: Date;
}

export interface VehicleTravelRepository {
  findDevicePositions(userId: string, deviceId: string, from: Date, to: Date): Promise<TravelPoint[]>;
  findTripMerges(userId: string, deviceId: string): Promise<VehicleTripMerge[]>;
  createTripMerge(userId: string, deviceId: string, gapAfter: Date, gapBefore: Date): Promise<VehicleTripMerge>;
  deleteTripMergesNear(userId: string, deviceId: string, gapAfter: Date, gapBefore: Date, toleranceMs: number): Promise<void>;
  findLatestStoredTripEnd(userId: string, vehicleId: string, from: Date): Promise<Date | null>;
  findStoredTrips(userId: string, vehicleId: string, from: Date): Promise<StoredVehicleTrip[]>;
  findImportedTripPoints(userId: string, tripId: string, from: Date, to: Date): Promise<TravelPoint[]>;
  updateEstimatedOdometer(userId: string, vehicleId: string, value: number, updatedAt: Date): Promise<void>;
}
