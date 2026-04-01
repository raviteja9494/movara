import { api } from './client';

export interface SavedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedLocationsResponse {
  locations: SavedLocation[];
}

export interface SavedLocationResponse {
  location: SavedLocation;
}

export function fetchSavedLocations(): Promise<SavedLocationsResponse> {
  return api.get<SavedLocationsResponse>('/locations');
}

export function createSavedLocation(payload: {
  name: string;
  latitude: number;
  longitude: number;
  notes?: string | null;
}): Promise<SavedLocationResponse> {
  return api.post<SavedLocationResponse>('/locations', payload);
}

export function updateSavedLocation(
  id: string,
  payload: Partial<{ name: string; latitude: number; longitude: number; notes: string | null }>,
): Promise<SavedLocationResponse> {
  return api.patch<SavedLocationResponse>(`/locations/${id}`, payload);
}

export function deleteSavedLocation(id: string): Promise<void> {
  return api.delete(`/locations/${id}`);
}
