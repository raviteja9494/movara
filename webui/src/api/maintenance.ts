import { api } from './client';

export type MaintenanceType = 'service' | 'fuel' | 'repair' | 'inspection' | 'other';

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  type: string;
  notes: string | null;
  odometer: number | null;
  date: string;
  createdAt: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface MaintenanceListResponse {
  data: MaintenanceRecord[];
  pagination: PaginationMeta;
}

export interface CreateMaintenancePayload {
  vehicleId: string;
  type: MaintenanceType;
  date: string;
  notes?: string | null;
  odometer?: number | null;
}

export interface CreateMaintenanceResponse {
  record: MaintenanceRecord;
}

export function fetchMaintenanceByVehicle(
  vehicleId: string,
  params?: { page?: number; limit?: number }
): Promise<MaintenanceListResponse> {
  const search = new URLSearchParams();
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  const path = qs ? `/maintenance/${vehicleId}?${qs}` : `/maintenance/${vehicleId}`;
  return api.get<MaintenanceListResponse>(path);
}

export function createMaintenanceRecord(
  payload: CreateMaintenancePayload
): Promise<CreateMaintenanceResponse> {
  const body: Record<string, unknown> = {
    vehicleId: payload.vehicleId,
    type: payload.type,
    date: payload.date,
  };
  if (payload.notes !== undefined && payload.notes !== null && payload.notes !== '') {
    body.notes = payload.notes.trim();
  }
  if (payload.odometer !== undefined && payload.odometer !== null) {
    body.odometer = payload.odometer;
  }
  return api.post<CreateMaintenanceResponse>('/maintenance', body);
}
