import { api } from './client';
import { getApiBaseUrl } from './apiConfig';
import { getToken } from './tokenStorage';

export type MaintenanceType = 'service' | 'fuel' | 'repair' | 'inspection' | 'other';

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  type: string;
  notes: string | null;
  odometer: number | null;
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
