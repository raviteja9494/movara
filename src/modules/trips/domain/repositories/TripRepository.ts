import type { NewTrip, Trip, TripGap, TripPoint, TripStop } from '../entities';

export interface TripFilters { vehicleId?: string; deviceId?: string; favorite?: boolean; from?: Date; to?: Date }
export interface StopInput { label: string; startTime: Date; endTime?: Date | null; latitude: number; longitude: number; sortOrder?: number }

export interface TripRepository {
  list(userId: string, filters: TripFilters, offset: number, limit: number): Promise<{ items: Trip[]; total: number }>;
  findById(userId: string, id: string): Promise<Trip | null>;
  deviceExists(userId: string, id: string): Promise<boolean>;
  vehicleExists(userId: string, id: string): Promise<boolean>;
  create(data: NewTrip): Promise<Trip>;
  update(userId: string, id: string, data: { name?: string | null; favorite?: boolean; startTime?: Date; endTime?: Date }): Promise<Trip>;
  delete(userId: string, id: string): Promise<void>;
  loadPoints(userId: string, trip: Trip): Promise<TripPoint[]>;
  loadStops(userId: string, tripId: string): Promise<TripStop[]>;
  loadMergedGaps(userId: string, trip: Trip): Promise<TripGap[]>;
  findAdjacent(userId: string, trip: Trip): Promise<{ previous: Trip | null; next: Trip | null }>;
  findStop(userId: string, tripId: string, stopId: string): Promise<TripStop | null>;
  createStop(userId: string, tripId: string, input: StopInput): Promise<TripStop>;
  updateStop(userId: string, stopId: string, input: Partial<StopInput>): Promise<TripStop>;
  deleteStop(userId: string, stopId: string): Promise<void>;
  replaceWithSplit(userId: string, originalId: string, parts: NewTrip[]): Promise<Trip[]>;
  replaceWithMerge(source: Trip, target: Trip, data: NewTrip, stops: TripStop[], positions: TripPoint[], gap?: TripGap): Promise<Trip>;
  findFusionCandidates(userId: string, source: Trip, paddingMs: number, limit: number): Promise<Trip[]>;
}
