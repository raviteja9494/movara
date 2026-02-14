import { api } from './client';

export interface Vehicle {
  id: string;
  name: string;
  description: string | null;
  licensePlate: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  currentOdometer: number | null;
  fuelType: string | null;
  icon: string | null;
  deviceId: string | null;
  createdAt: string;
}

export interface FuelRecord {
  id: string;
  vehicleId: string;
  date: string;
  odometer: number;
  fuelQuantity: number;
  fuelCost: number | null;
  fuelRate: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface Trip {
  startedAt: string;
  endedAt: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  distanceKm: number;
  pointCount: number;
}

export const VEHICLE_ICONS = [
  { value: 'car', label: 'Car', emoji: '🚗' },
  { value: 'bike', label: 'Bike', emoji: '🏍️' },
  { value: 'truck', label: 'Truck', emoji: '🚚' },
  { value: 'van', label: 'Van', emoji: '🚐' },
  { value: 'bus', label: 'Bus', emoji: '🚌' },
  { value: 'sedan', label: 'Sedan', emoji: '🚙' },
] as const;

export function vehicleIconEmoji(icon: string | null): string {
  if (!icon) return '🚙';
  const found = VEHICLE_ICONS.find((i) => i.value === icon);
  return found ? found.emoji : '🚙';
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface VehiclesResponse {
  data: Vehicle[];
  pagination: PaginationMeta;
}

export interface CreateVehiclePayload {
  name: string;
  description?: string | null;
  licensePlate?: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  currentOdometer?: number | null;
  fuelType?: string | null;
  icon?: string | null;
  deviceId?: string | null;
}

export interface CreateVehicleResponse {
  vehicle: Vehicle;
}

export interface UpdateVehiclePayload {
  deviceId?: string | null;
  icon?: string | null;
}

export interface FuelRecordsResponse {
  fuelRecords: FuelRecord[];
}

export interface CreateFuelRecordPayload {
  date: string;
  odometer: number;
  fuelQuantity: number;
  fuelCost?: number | null;
  fuelRate?: number | null;
}

export function fetchVehicles(params?: { page?: number; limit?: number }): Promise<VehiclesResponse> {
  const search = new URLSearchParams();
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<VehiclesResponse>(qs ? `/vehicles?${qs}` : '/vehicles');
}

export function fetchVehicle(id: string): Promise<{ vehicle: Vehicle }> {
  return api.get<{ vehicle: Vehicle }>(`/vehicles/${id}`);
}

export function createVehicle(payload: CreateVehiclePayload): Promise<CreateVehicleResponse> {
  const body: Record<string, unknown> = {
    name: payload.name.trim(),
  };
  if (payload.description !== undefined && payload.description !== null && payload.description !== '') {
    body.description = payload.description.trim();
  }
  if (payload.licensePlate !== undefined && payload.licensePlate !== null && payload.licensePlate !== '') {
    body.licensePlate = payload.licensePlate.trim();
  }
  if (payload.vin !== undefined && payload.vin !== null && payload.vin !== '') body.vin = payload.vin.trim();
  if (payload.year !== undefined && payload.year !== null) body.year = payload.year;
  if (payload.make !== undefined && payload.make !== null && payload.make !== '') body.make = payload.make.trim();
  if (payload.model !== undefined && payload.model !== null && payload.model !== '') body.model = payload.model.trim();
  if (payload.currentOdometer !== undefined && payload.currentOdometer !== null) {
    body.currentOdometer = payload.currentOdometer;
  }
  if (payload.fuelType !== undefined && payload.fuelType !== null && payload.fuelType !== '') {
    body.fuelType = payload.fuelType.trim();
  }
  if (payload.icon !== undefined && payload.icon !== null && payload.icon !== '') body.icon = payload.icon;
  if (payload.deviceId !== undefined && payload.deviceId !== null && payload.deviceId !== '') {
    body.deviceId = payload.deviceId;
  }
  return api.post<CreateVehicleResponse>('/vehicles', body);
}

export function updateVehicle(id: string, payload: UpdateVehiclePayload): Promise<{ vehicle: Vehicle }> {
  return api.patch<{ vehicle: Vehicle }>(`/vehicles/${id}`, payload);
}

export function fetchFuelRecords(vehicleId: string): Promise<FuelRecordsResponse> {
  return api.get<FuelRecordsResponse>(`/vehicles/${vehicleId}/fuel-records`);
}

export function createFuelRecord(
  vehicleId: string,
  payload: CreateFuelRecordPayload
): Promise<{ fuelRecord: FuelRecord }> {
  return api.post<{ fuelRecord: FuelRecord }>(`/vehicles/${vehicleId}/fuel-records`, payload);
}

export function fetchVehicleTrips(
  vehicleId: string,
  from: string,
  to: string
): Promise<{ trips: Trip[] }> {
  const params = new URLSearchParams({ from, to });
  return api.get<{ trips: Trip[] }>(`/vehicles/${vehicleId}/trips?${params.toString()}`);
}
