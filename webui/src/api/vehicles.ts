import { api } from './client';

export interface Vehicle {
  id: string;
  name: string;
  description: string | null;
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

export interface VehiclesResponse {
  data: Vehicle[];
  pagination: PaginationMeta;
}

export interface CreateVehiclePayload {
  name: string;
  description?: string | null;
}

export interface CreateVehicleResponse {
  vehicle: Vehicle;
}

export function fetchVehicles(params?: { page?: number; limit?: number }): Promise<VehiclesResponse> {
  const search = new URLSearchParams();
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<VehiclesResponse>(qs ? `/vehicles?${qs}` : '/vehicles');
}

export function createVehicle(payload: CreateVehiclePayload): Promise<CreateVehicleResponse> {
  return api.post<CreateVehicleResponse>('/vehicles', {
    name: payload.name.trim(),
    ...(payload.description !== undefined && payload.description !== null && payload.description !== ''
      ? { description: payload.description.trim() }
      : {}),
  });
}
