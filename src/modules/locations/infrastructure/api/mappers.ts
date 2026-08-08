import type { SavedLocation } from '../../domain/entities';

export function savedLocationToDto(location: SavedLocation) {
  return {
    id: location.id,
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    notes: location.notes,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
    userId: location.userId,
  };
}
