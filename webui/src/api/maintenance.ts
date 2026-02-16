import { api } from './client';
import { getApiBaseUrl } from './apiConfig';
import { getToken } from './tokenStorage';

export type MaintenanceType = 'service' | 'repair' | 'inspection' | 'other';

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  vehicleName?: string | null;
  type: string;
  notes: string | null;
  odometer: number | null;
  cost?: number | null;
  date: string;
  receiptPath?: string | null;
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
  cost?: number | null;
}

export interface CreateMaintenanceResponse {
  record: MaintenanceRecord;
}

/** Fetch recent maintenance records across all vehicles (for overview). */
export function fetchMaintenanceRecent(params?: { page?: number; limit?: number }): Promise<MaintenanceListResponse> {
  const search = new URLSearchParams();
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<MaintenanceListResponse>(qs ? `/maintenance?${qs}` : '/maintenance');
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
  if (payload.cost !== undefined && payload.cost !== null) {
    body.cost = payload.cost;
  }
  return api.post<CreateMaintenanceResponse>('/maintenance', body);
}

export interface UpdateMaintenancePayload {
  type?: MaintenanceType;
  date?: string;
  notes?: string | null;
  odometer?: number | null;
  cost?: number | null;
}

export function updateMaintenanceRecord(
  id: string,
  payload: UpdateMaintenancePayload
): Promise<{ record: MaintenanceRecord }> {
  const body: Record<string, unknown> = {};
  if (payload.type !== undefined) body.type = payload.type;
  if (payload.date !== undefined) body.date = payload.date;
  if (payload.notes !== undefined) body.notes = payload.notes === '' ? null : payload.notes;
  if (payload.odometer !== undefined) body.odometer = payload.odometer;
  if (payload.cost !== undefined) body.cost = payload.cost;
  return api.patch<{ record: MaintenanceRecord }>(`/maintenance/${id}`, body);
}

export function deleteMaintenanceRecord(id: string): Promise<void> {
  return api.delete(`/maintenance/${id}`);
}

/** Upload receipt for a maintenance record (image or PDF). Returns updated record. */
export async function uploadMaintenanceReceipt(
  recordId: string,
  file: File
): Promise<{ record: MaintenanceRecord }> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}/maintenance/${recordId}/receipt`;
  const form = new FormData();
  form.append('file', file);
  const token = getToken();
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

/** Fetch receipt as blob URL to view in new tab. Call URL.revokeObjectURL when done. */
export async function getMaintenanceReceiptBlobUrl(recordId: string): Promise<string> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}/maintenance/${recordId}/receipt`;
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Receipt not found');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
