import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface SavedLocationRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const FILE_PATH = path.resolve(process.cwd(), 'data', 'saved-locations.json');

class FileSavedLocationStore {
  list(): SavedLocationRecord[] {
    return this.read().sort((left, right) => left.name.localeCompare(right.name));
  }

  create(input: {
    name: string;
    latitude: number;
    longitude: number;
    notes: string | null;
  }): SavedLocationRecord {
    const now = new Date().toISOString();
    const next: SavedLocationRecord = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const records = this.read();
    records.push(next);
    this.write(records);
    return next;
  }

  update(
    id: string,
    patch: Partial<Pick<SavedLocationRecord, 'name' | 'latitude' | 'longitude' | 'notes'>>,
  ): SavedLocationRecord | null {
    const records = this.read();
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) return null;
    const current = records[index];
    const next: SavedLocationRecord = {
      ...current,
      name: patch.name !== undefined ? patch.name.trim() : current.name,
      latitude: patch.latitude !== undefined ? patch.latitude : current.latitude,
      longitude: patch.longitude !== undefined ? patch.longitude : current.longitude,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
      updatedAt: new Date().toISOString(),
    };
    records[index] = next;
    this.write(records);
    return next;
  }

  delete(id: string): boolean {
    const records = this.read();
    const filtered = records.filter((record) => record.id !== id);
    if (filtered.length === records.length) return false;
    this.write(filtered);
    return true;
  }

  private read(): SavedLocationRecord[] {
    try {
      if (!fs.existsSync(FILE_PATH)) return [];
      const raw = fs.readFileSync(FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as SavedLocationRecord[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && typeof item === 'object' && typeof item.id === 'string');
    } catch {
      return [];
    }
  }

  private write(records: SavedLocationRecord[]): void {
    fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(records, null, 2), 'utf8');
  }
}

export const savedLocationStore = new FileSavedLocationStore();
