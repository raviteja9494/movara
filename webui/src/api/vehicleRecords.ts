import { api } from './client';
import { getApiBaseUrl } from './apiConfig';
import { getToken } from './tokenStorage';

export type VehicleRecordType = 'maintenance' | 'document' | 'subscription' | 'expense' | 'accessory';
export type VehicleRecordSubtype =
  | 'service'
  | 'repair'
  | 'inspection'
  | 'other'
  | 'insurance_third_party'
  | 'insurance_own_damage'
  | 'pollution_check'
  | 'registration'
  | 'sim_recharge'
  | 'tracker_purchase'
  | 'accessory_purchase'
  | 'permit'
  | 'warranty'
  | 'custom';
export type VehicleRecordReminderMode = 'none' | 'on_date' | 'recurring_date' | 'recurring_odometer';

export interface VehicleRecord {
  id: string;
  vehicleId: string;
  vehicleName?: string | null;
  type: VehicleRecordType;
  subtype: VehicleRecordSubtype | null;
  title: string;
  notes: string | null;
  amount: number | null;
  odometer: number | null;
  date: string;
  validFrom: string | null;
  validUntil: string | null;
  provider: string | null;
  referenceNumber: string | null;
  reminderMode: VehicleRecordReminderMode;
  reminderDaysBefore: number | null;
  recurringIntervalDays: number | null;
  recurringIntervalKm: number | null;
  attachmentPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface VehicleRecordListResponse {
  data: VehicleRecord[];
  pagination: PaginationMeta;
}

export interface CreateVehicleRecordPayload {
  vehicleId: string;
  type: VehicleRecordType;
  subtype?: VehicleRecordSubtype | null;
  title: string;
  notes?: string | null;
  amount?: number | null;
  odometer?: number | null;
  date: string;
  validFrom?: string | null;
  validUntil?: string | null;
  provider?: string | null;
  referenceNumber?: string | null;
  reminderMode?: VehicleRecordReminderMode;
  reminderDaysBefore?: number | null;
  recurringIntervalDays?: number | null;
  recurringIntervalKm?: number | null;
}

export type UpdateVehicleRecordPayload = Partial<CreateVehicleRecordPayload>;

export function fetchVehicleRecords(params?: {
  vehicleId?: string;
  type?: VehicleRecordType;
  page?: number;
  limit?: number;
}): Promise<VehicleRecordListResponse> {
  const search = new URLSearchParams();
  if (params?.vehicleId) search.set('vehicleId', params.vehicleId);
  if (params?.type) search.set('type', params.type);
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<VehicleRecordListResponse>(qs ? `/vehicle-records?${qs}` : '/vehicle-records');
}

export function createVehicleRecord(payload: CreateVehicleRecordPayload): Promise<{ record: VehicleRecord }> {
  return api.post<{ record: VehicleRecord }>('/vehicle-records', payload);
}

export function updateVehicleRecord(id: string, payload: UpdateVehicleRecordPayload): Promise<{ record: VehicleRecord }> {
  return api.patch<{ record: VehicleRecord }>(`/vehicle-records/${id}`, payload);
}

export function deleteVehicleRecord(id: string): Promise<void> {
  return api.delete(`/vehicle-records/${id}`);
}

export async function uploadVehicleRecordAttachment(recordId: string, file: File): Promise<{ record: VehicleRecord }> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}/vehicle-records/${recordId}/attachment`;
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

export async function getVehicleRecordAttachmentBlobUrl(recordId: string): Promise<string> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}/vehicle-records/${recordId}/attachment`;
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Attachment not found');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
