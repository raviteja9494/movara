import { NotFoundError } from '../../../../shared/errors';
import { computeTripStats } from '../../../../shared/utils';
import { parseGpxTrackPoints } from '../../../../shared/utils/parseGpx';
import type { NewTrip, Trip, TripPoint } from '../../domain/entities';
import type { StopInput, TripFilters, TripRepository } from '../../domain/repositories';
import { evaluateFusionCandidate, fusePoints, toFusionPoints, type FusionEvaluation } from './fusion';
import type { OwnershipPolicy } from '../../../../shared/authorization';

export class TripInputError extends Error {}

export class TripUseCases {
  constructor(private readonly trips: TripRepository, private readonly ownership: OwnershipPolicy) {}

  list(userId: string, filters: TripFilters, page: number, limit: number) {
    this.ownership.requireActor(userId);
    return this.trips.list(userId, filters, (page - 1) * limit, limit);
  }

  async create(userId: string, input: Omit<NewTrip, 'source' | 'userId'>): Promise<Trip> {
    this.ownership.requireActor(userId);
    this.assertRange(input.startTime, input.endTime);
    if (input.deviceId && !await this.trips.deviceExists(userId, input.deviceId)) throw new TripInputError('Device not found');
    if (input.vehicleId && !await this.trips.vehicleExists(userId, input.vehicleId)) throw new TripInputError('Vehicle not found');
    return this.trips.create({ ...input, userId, source: 'device' });
  }

  async detail(userId: string, id: string) {
    const trip = await this.requireTrip(userId, id);
    if (trip.source !== 'imported' && !trip.deviceId) throw new TripInputError('Trip has no device');
    const [positions, stops, mergedGaps, adjacentTrips] = await Promise.all([
      this.trips.loadPoints(userId, trip), this.trips.loadStops(userId, id), this.trips.loadMergedGaps(userId, trip), this.trips.findAdjacent(userId, trip),
    ]);
    positions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return { trip, positions, stats: computeTripStats(positions), stops, mergedGaps, adjacentTrips };
  }

  async update(userId: string, id: string, input: { name?: string | null; favorite?: boolean; startTime?: Date; endTime?: Date }) {
    const trip = await this.requireTrip(userId, id);
    this.assertRange(input.startTime ?? trip.startTime, input.endTime ?? trip.endTime,
      input.startTime && !input.endTime ? 'startTime must be before existing endTime' : input.endTime && !input.startTime ? 'endTime must be after existing startTime' : undefined);
    return Object.keys(input).length ? this.trips.update(userId, id, input) : trip;
  }

  async delete(userId: string, id: string) { await this.requireTrip(userId, id); await this.trips.delete(userId, id); }

  async createStop(userId: string, tripId: string, input: StopInput) {
    const trip = await this.requireTrip(userId, tripId);
    if (input.startTime < trip.startTime || input.startTime > trip.endTime) throw new TripInputError('Stop startTime must be within trip time range');
    if (input.endTime && input.endTime <= input.startTime) throw new TripInputError('Stop endTime must be after startTime');
    if (input.endTime && input.endTime > trip.endTime) throw new TripInputError('Stop endTime must be within trip time range');
    return this.trips.createStop(userId, tripId, input);
  }

  async updateStop(userId: string, tripId: string, stopId: string, input: { label?: string; endTime?: Date | null }) {
    await this.ownership.assertOwns(userId, 'tripStop', stopId);
    const [trip, stop] = await Promise.all([this.requireTrip(userId, tripId), this.trips.findStop(userId, tripId, stopId)]);
    if (!stop) throw new NotFoundError('Trip stop', stopId);
    if (input.endTime && input.endTime <= stop.startTime) throw new TripInputError('Stop endTime must be after startTime');
    if (input.endTime && input.endTime > trip.endTime) throw new TripInputError('Stop endTime must be within trip time range');
    return Object.keys(input).length ? this.trips.updateStop(userId, stopId, input) : stop;
  }

  async deleteStop(userId: string, tripId: string, stopId: string) {
    await this.requireTrip(userId, tripId);
    await this.ownership.assertOwns(userId, 'tripStop', stopId);
    if (!await this.trips.findStop(userId, tripId, stopId)) throw new NotFoundError('Trip stop', stopId);
    await this.trips.deleteStop(userId, stopId);
  }

  async split(userId: string, id: string, splitAt: Date) {
    const trip = await this.requireTrip(userId, id);
    if (splitAt <= trip.startTime || splitAt >= trip.endTime) throw new TripInputError('splitAt must be between trip startTime and endTime');
    let firstEnd = splitAt;
    let secondStart = splitAt;
    let firstPoints: TripPoint[] | undefined;
    let secondPoints: TripPoint[] | undefined;
    if (trip.source === 'imported') {
      const points = await this.trips.loadPoints(userId, trip);
      const index = points.findIndex((point) => point.timestamp.getTime() >= splitAt.getTime());
      if (index <= 0 || index >= points.length) throw new TripInputError('splitAt does not fall between two positions');
      firstPoints = points.slice(0, index); secondPoints = points.slice(index);
      firstEnd = firstPoints[firstPoints.length - 1].timestamp; secondStart = secondPoints[0].timestamp;
    }
    return this.trips.replaceWithSplit(userId, id, [
      { userId, deviceId: trip.deviceId, vehicleId: trip.vehicleId, startTime: trip.startTime, endTime: firstEnd, name: trip.name ? `${trip.name} (1)` : null, source: trip.source, positions: firstPoints },
      { userId, deviceId: trip.deviceId, vehicleId: trip.vehicleId, startTime: secondStart, endTime: trip.endTime, name: trip.name ? `${trip.name} (2)` : null, source: trip.source, positions: secondPoints },
    ]);
  }

  async merge(userId: string, id: string, targetId: string) {
    if (id === targetId) throw new TripInputError('targetTripId must be different from source trip id');
    const [source, target] = await Promise.all([this.requireTrip(userId, id), this.requireTrip(userId, targetId)]);
    if (source.source !== target.source) throw new TripInputError('Trips must have the same source type to merge');
    const sameVehicle = source.vehicleId && source.vehicleId === target.vehicleId;
    const sameDevice = source.deviceId && source.deviceId === target.deviceId;
    if (!sameVehicle && !sameDevice) throw new TripInputError('Trips must share the same vehicle or device to merge');
    if (source.vehicleId && target.vehicleId && source.vehicleId !== target.vehicleId) throw new TripInputError('Trips linked to different vehicles cannot be merged');
    if (source.deviceId && target.deviceId && source.deviceId !== target.deviceId) throw new TripInputError('Trips linked to different devices cannot be merged');
    const [sourceStops, targetStops, sourcePoints, targetPoints] = await Promise.all([
      this.trips.loadStops(userId, source.id), this.trips.loadStops(userId, target.id),
      source.source === 'imported' ? this.trips.loadPoints(userId, source) : Promise.resolve([]),
      target.source === 'imported' ? this.trips.loadPoints(userId, target) : Promise.resolve([]),
    ]);
    const earlier = source.endTime <= target.startTime ? source : target.endTime <= source.startTime ? target : source.startTime <= target.startTime ? source : target;
    const later = earlier.id === source.id ? target : source;
    const data: NewTrip = {
      userId,
      deviceId: source.deviceId ?? target.deviceId, vehicleId: source.vehicleId ?? target.vehicleId,
      startTime: new Date(Math.min(source.startTime.getTime(), target.startTime.getTime())),
      endTime: new Date(Math.max(source.endTime.getTime(), target.endTime.getTime())),
      name: source.name ?? target.name, favorite: source.favorite || target.favorite, source: source.source,
    };
    const stops = [...sourceStops, ...targetStops].sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.sortOrder - b.sortOrder);
    const points = [...sourcePoints, ...targetPoints].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const merged = await this.trips.replaceWithMerge(source, target, data, stops, points,
      data.deviceId && earlier.endTime < later.startTime ? { gapAfter: earlier.endTime, gapBefore: later.startTime } : undefined);
    return { trip: merged, deletedTripIds: [source.id, target.id] };
  }

  async fusionCandidates(userId: string, id: string) {
    const source = await this.requireTrip(userId, id);
    const sourcePoints = toFusionPoints(source, await this.trips.loadPoints(userId, source));
    const candidates = [];
    for (const candidate of await this.trips.findFusionCandidates(userId, source, 6 * 60 * 60 * 1000, 20)) {
      if (source.deviceId && candidate.deviceId === source.deviceId) continue;
      const points = toFusionPoints(candidate, await this.trips.loadPoints(userId, candidate));
      if (points.length < 2) continue;
      candidates.push({ trip: candidate, pointCount: points.length, ...evaluateFusionCandidate(source, candidate, sourcePoints, points, 5 * 60 * 1000) });
    }
    const rank = { high: 0, medium: 1, low: 2 };
    return candidates.sort((a, b) => rank[a.confidence] - rank[b.confidence] || b.coverageGainPoints - a.coverageGainPoints);
  }

  async fuse(userId: string, id: string, input: { targetTripId: string; primaryTripId?: string; gapThresholdMinutes: number; name?: string | null }): Promise<{ trip: Trip; pointCount: number; evaluation: FusionEvaluation }> {
    if (input.targetTripId === id) throw new TripInputError('targetTripId must be different from source trip id');
    if (input.primaryTripId && input.primaryTripId !== id && input.primaryTripId !== input.targetTripId) throw new TripInputError('primaryTripId must be one of the selected trips');
    const [source, target] = await Promise.all([this.requireTrip(userId, id), this.requireTrip(userId, input.targetTripId)]);
    if (source.deviceId && source.deviceId === target.deviceId) throw new TripInputError('Fusion is for trips from different trackers. Use merge for same-device trips.');
    if (source.vehicleId && target.vehicleId && source.vehicleId !== target.vehicleId) throw new TripInputError('Trips linked to different vehicles cannot be fused');
    const [sourcePoints, targetPoints] = await Promise.all([this.trips.loadPoints(userId, source), this.trips.loadPoints(userId, target)]);
    if (sourcePoints.length < 2 || targetPoints.length < 2) throw new TripInputError('Both trips need at least two points to fuse');
    const sourceFusion = toFusionPoints(source, sourcePoints), targetFusion = toFusionPoints(target, targetPoints);
    const threshold = input.gapThresholdMinutes * 60000;
    const evaluation = evaluateFusionCandidate(source, target, sourceFusion, targetFusion, threshold);
    if (evaluation.confidence === 'low') throw new TripInputError('Trips do not look similar enough to fuse safely');
    const fused = fusePoints(input.primaryTripId === input.targetTripId ? targetFusion : sourceFusion, input.primaryTripId === input.targetTripId ? sourceFusion : targetFusion, threshold);
    if (fused.length < 2) throw new TripInputError('Fusion did not produce enough points');
    const trip = await this.trips.create({ userId, vehicleId: source.vehicleId ?? target.vehicleId, startTime: fused[0].timestamp, endTime: fused[fused.length - 1].timestamp, name: input.name ?? `Fused: ${source.name ?? source.device?.name ?? source.device?.imei ?? 'Trip'} + ${target.name ?? target.device?.name ?? target.device?.imei ?? 'Trip'}`, favorite: source.favorite || target.favorite, source: 'imported', positions: fused });
    return { trip, pointCount: fused.length, evaluation };
  }

  async importGpx(userId: string, xml: string, vehicleId: string | undefined, name: string) {
    this.ownership.requireActor(userId);
    const points = parseGpxTrackPoints(xml);
    if (points.length < 2) throw new TripInputError('GPX must contain at least 2 track points');
    if (vehicleId && !await this.trips.vehicleExists(userId, vehicleId)) throw new TripInputError('Vehicle not found');
    return this.trips.create({ userId, vehicleId, startTime: points[0].timestamp, endTime: points[points.length - 1].timestamp, name: name || undefined, source: 'imported', positions: points.map((point) => ({ ...point, speed: point.speed ?? null })) });
  }

  private async requireTrip(userId: string, id: string) { await this.ownership.assertOwns(userId, 'trip', id); const trip = await this.trips.findById(userId, id); if (!trip) throw new NotFoundError('Trip', id); return trip; }
  private assertRange(start: Date, end: Date, message = 'endTime must be after startTime') { if (end <= start) throw new TripInputError(message); }
}
