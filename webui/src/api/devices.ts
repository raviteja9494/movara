import { api } from './client';

export interface Device {
  id: string;
  imei: string;
  name: string | null;
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

export interface DevicesResponse {
  data: Device[];
  pagination: PaginationMeta;
}

export function fetchDevices(params?: { page?: number; limit?: number }): Promise<DevicesResponse> {
  const search = new URLSearchParams();
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<DevicesResponse>(qs ? `/devices?${qs}` : '/devices');
}
