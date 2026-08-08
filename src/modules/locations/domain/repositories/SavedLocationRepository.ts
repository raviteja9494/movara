import type { SavedLocation } from '../entities';

export interface SavedLocationUpdate {
  name?: string;
  latitude?: number;
  longitude?: number;
  notes?: string | null;
}

export interface SavedLocationRepository {
  findAllForUser(userId: string): Promise<SavedLocation[]>;
  findById(userId: string, id: string): Promise<SavedLocation | null>;
  create(location: SavedLocation): Promise<SavedLocation>;
  update(userId: string, id: string, input: SavedLocationUpdate): Promise<SavedLocation>;
  delete(userId: string, id: string): Promise<void>;
}
