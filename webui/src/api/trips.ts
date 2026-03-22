import { api } from './client';
import { getToken } from './tokenStorage';
import { getApiBaseUrl } from './apiConfig';

export interface TripDevice {
  id: string;
  imei: string;
  name: string | null;
}

export interface TripVehicle {
  id: string;
  name: string;
}

export interface TripListItem {
  id: string;
  deviceId: string | null;
  device: TripDevice | null;
  vehicleId: string | null;
  vehicle: TripVehicle | null;
  startTime: string;
  endTime: string;
  name: string | null;
  source: 'device' | 'imported';
  createdAt: string;
}

export interface TripDetailPosition {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
}

export interface TripStats {
  odometerKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  pointCount: number;
}

export interface TripStopItem {
  id: string;
  label: string;
  startTime: string;
  endTime: string | null;
  latitude: number;
  longitude: number;
  sortOrder: number;
}

export interface TripDetailResponse {
  trip: TripListItem;
  positions: TripDetailPosition[];
  stats: TripStats;
  stops?: TripStopItem[];
  adjacentTrips?: {
    previous: TripListItem | null;
    next: TripListItem | null;
  };
}

export interface TripsResponse {
  data: TripListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface CreateTripPayload {
  deviceId: string;
  startTime: string;
  endTime: string;
  vehicleId?: string | null;
  name?: string | null;
}

export function fetchTrips(params?: {
  vehicleId?: string;
  deviceId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<TripsResponse> {
  const search = new URLSearchParams();
  if (params?.vehicleId) search.set('vehicleId', params.vehicleId);
  if (params?.deviceId) search.set('deviceId', params.deviceId);
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<TripsResponse>(qs ? `/trips?${qs}` : '/trips');
}

export function fetchTrip(id: string): Promise<TripDetailResponse> {
  return api.get<TripDetailResponse>(`/trips/${id}`);
}

export function createTrip(payload: CreateTripPayload): Promise<{ trip: TripListItem }> {
  return api.post<{ trip: TripListItem }>('/trips', payload);
}

export function updateTrip(
  id: string,
  payload: { name?: string | null; startTime?: string; endTime?: string }
): Promise<{ trip: TripListItem }> {
  return api.patch<{ trip: TripListItem }>(`/trips/${id}`, payload);
}

export function splitTrip(
  id: string,
  payload: { splitAt: string }
): Promise<{ trips: Array<{ id: string; startTime: string; endTime: string; name: string | null }> }> {
  return api.post<{ trips: Array<{ id: string; startTime: string; endTime: string; name: string | null }> }>(
    `/trips/${id}/split`,
    payload
  );
}

export function deleteTrip(id: string): Promise<void> {
  return api.delete(`/trips/${id}`);
}

export function addTripStop(
  tripId: string,
  payload: { label: string; startTime: string; endTime?: string; latitude: number; longitude: number }
): Promise<{ stop: TripStopItem }> {
  return api.post<{ stop: TripStopItem }>(`/trips/${tripId}/stops`, payload);
}

export function updateTripStop(
  tripId: string,
  stopId: string,
  payload: { label?: string; endTime?: string | null }
): Promise<{ stop: TripStopItem }> {
  return api.patch<{ stop: TripStopItem }>(`/trips/${tripId}/stops/${stopId}`, payload);
}

export function deleteTripStop(tripId: string, stopId: string): Promise<void> {
  return api.delete(`/trips/${tripId}/stops/${stopId}`);
}

export async function importTripGpx(
  file: File,
  options?: { vehicleId?: string; name?: string }
): Promise<{ trip: TripListItem }> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const path = `${base}/trips/import-gpx`;
  const qs = new URLSearchParams();
  if (options?.vehicleId) qs.set('vehicleId', options.vehicleId);
  if (options?.name) qs.set('name', options.name);
  const url = qs.toString() ? `${path}?${qs.toString()}` : path;
  const fullUrl = path.startsWith('http') ? url : `${typeof window !== 'undefined' ? window.location.origin : ''}${url.startsWith('/') ? '' : '/'}${url}`;
  const form = new FormData();
  form.append('file', file);
  const token = getToken();
  const res = await fetch(fullUrl, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
