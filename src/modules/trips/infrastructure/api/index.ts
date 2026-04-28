import { FastifyInstance } from 'fastify';
import {
  validate,
  CreateTripSchema,
  ListTripsQuerySchema,
  UpdateTripSchema,
  SplitTripSchema,
  MergeTripsSchema,
  FuseTripsSchema,
  CreateTripStopSchema,
  UpdateTripStopSchema,
  type SplitTripRequest,
  type MergeTripsRequest,
  type FuseTripsRequest,
  type CreateTripStopRequest,
  type UpdateTripStopRequest,
} from '../../../../shared/validation';
import { getPrismaClient } from '../../../../infrastructure/db';
import { NotFoundError } from '../../../../shared/errors';
import { computeTripStats } from '../../../../shared/utils';
import { parseGpxTrackPoints } from '../../../../shared/utils/parseGpx';
import { getOffset } from '../../../../shared/utils';
import type { PrismaClient } from '@prisma/client';

type TripForFusion = {
  id: string;
  deviceId: string | null;
  device: { id: string; imei: string; name: string | null } | null;
  vehicleId: string | null;
  vehicle: { id: string; name: string } | null;
  startTime: Date;
  endTime: Date;
  name: string | null;
  favorite: boolean;
  source: string;
  createdAt: Date;
};

type FusionPoint = {
  latitude: number;
  longitude: number;
  timestamp: Date;
  speed: number | null;
  sourceTripId: string;
  sourceDeviceId: string | null;
  sourceLabel: string;
};

type FusionEvaluation = {
  overlapMs: number;
  overlapPercent: number;
  matchedSamples: number;
  medianDistanceMeters: number | null;
  confidence: 'high' | 'medium' | 'low';
  coverageGainPoints: number;
  warnings: string[];
};

const FUSION_MATCH_WINDOW_MS = 60 * 1000;
const FUSION_DEDUPE_MS = 15 * 1000;
const FUSION_DEDUPE_METERS = 50;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function tripLabel(trip: TripForFusion): string {
  return trip.device?.name ?? trip.device?.imei ?? trip.name ?? 'Trip';
}

async function loadTripFusionPoints(prisma: PrismaClient, trip: TripForFusion): Promise<FusionPoint[]> {
  if (trip.source === 'imported') {
    const positions = await prisma.tripPosition.findMany({
      where: { tripId: trip.id },
      orderBy: [{ timestamp: 'asc' }, { sortOrder: 'asc' }],
    });
    return positions.map((position) => ({
      latitude: position.latitude,
      longitude: position.longitude,
      timestamp: position.timestamp,
      speed: position.speed,
      sourceTripId: trip.id,
      sourceDeviceId: trip.deviceId,
      sourceLabel: tripLabel(trip),
    }));
  }

  if (!trip.deviceId) return [];
  const positions = await prisma.position.findMany({
    where: {
      deviceId: trip.deviceId,
      timestamp: { gte: trip.startTime, lte: trip.endTime },
    },
    orderBy: { timestamp: 'asc' },
  });
  return positions.map((position) => ({
    latitude: position.latitude,
    longitude: position.longitude,
    timestamp: position.timestamp,
    speed: position.speed,
    sourceTripId: trip.id,
    sourceDeviceId: trip.deviceId,
    sourceLabel: tripLabel(trip),
  }));
}

function findNearestByTime(points: FusionPoint[], timestamp: Date, windowMs: number): FusionPoint | null {
  let best: FusionPoint | null = null;
  let bestDelta = windowMs + 1;
  const target = timestamp.getTime();
  for (const point of points) {
    const delta = Math.abs(point.timestamp.getTime() - target);
    if (delta <= windowMs && delta < bestDelta) {
      best = point;
      bestDelta = delta;
    }
  }
  return best;
}

function countSecondaryGapPoints(primary: FusionPoint[], secondary: FusionPoint[], gapThresholdMs: number): number {
  if (secondary.length === 0) return 0;
  if (primary.length === 0) return secondary.length;
  let count = 0;
  const first = primary[0]!;
  const last = primary[primary.length - 1]!;
  count += secondary.filter((point) => first.timestamp.getTime() - point.timestamp.getTime() > gapThresholdMs).length;
  count += secondary.filter((point) => point.timestamp.getTime() - last.timestamp.getTime() > gapThresholdMs).length;
  for (let i = 1; i < primary.length; i++) {
    const prev = primary[i - 1]!;
    const next = primary[i]!;
    if (next.timestamp.getTime() - prev.timestamp.getTime() <= gapThresholdMs) continue;
    count += secondary.filter(
      (point) =>
        point.timestamp.getTime() > prev.timestamp.getTime() + FUSION_DEDUPE_MS &&
        point.timestamp.getTime() < next.timestamp.getTime() - FUSION_DEDUPE_MS,
    ).length;
  }
  return count;
}

function evaluateFusionCandidate(
  sourceTrip: TripForFusion,
  candidateTrip: TripForFusion,
  sourcePoints: FusionPoint[],
  candidatePoints: FusionPoint[],
  gapThresholdMs: number,
): FusionEvaluation {
  const overlapStart = Math.max(sourceTrip.startTime.getTime(), candidateTrip.startTime.getTime());
  const overlapEnd = Math.min(sourceTrip.endTime.getTime(), candidateTrip.endTime.getTime());
  const overlapMs = Math.max(0, overlapEnd - overlapStart);
  const sourceDurationMs = Math.max(1, sourceTrip.endTime.getTime() - sourceTrip.startTime.getTime());
  const overlapPercent = Math.min(1, overlapMs / sourceDurationMs);
  const sourceOverlapPoints = sourcePoints.filter(
    (point) => point.timestamp.getTime() >= overlapStart && point.timestamp.getTime() <= overlapEnd,
  );
  const step = Math.max(1, Math.ceil(sourceOverlapPoints.length / 80));
  const distances: number[] = [];
  for (let i = 0; i < sourceOverlapPoints.length; i += step) {
    const sourcePoint = sourceOverlapPoints[i]!;
    const matched = findNearestByTime(candidatePoints, sourcePoint.timestamp, FUSION_MATCH_WINDOW_MS);
    if (!matched) continue;
    distances.push(haversineMeters(sourcePoint.latitude, sourcePoint.longitude, matched.latitude, matched.longitude));
  }
  const medianDistanceMeters = median(distances);
  const coverageGainPoints = countSecondaryGapPoints(sourcePoints, candidatePoints, gapThresholdMs);
  const warnings: string[] = [];

  let confidence: FusionEvaluation['confidence'] = 'low';
  if (medianDistanceMeters != null && distances.length >= 3) {
    if (medianDistanceMeters <= 300 && overlapPercent >= 0.1) confidence = 'high';
    else if (medianDistanceMeters <= 1000) confidence = 'medium';
  } else if (coverageGainPoints >= 10) {
    const sourceEnd = sourcePoints[sourcePoints.length - 1];
    const candidateStart = candidatePoints[0];
    const sourceStart = sourcePoints[0];
    const candidateEnd = candidatePoints[candidatePoints.length - 1];
    const startOrEndDistance = Math.min(
      sourceEnd && candidateStart
        ? haversineMeters(sourceEnd.latitude, sourceEnd.longitude, candidateStart.latitude, candidateStart.longitude)
        : Number.POSITIVE_INFINITY,
      sourceStart && candidateEnd
        ? haversineMeters(sourceStart.latitude, sourceStart.longitude, candidateEnd.latitude, candidateEnd.longitude)
        : Number.POSITIVE_INFINITY,
    );
    if (startOrEndDistance <= 1000) confidence = 'medium';
  }

  if (medianDistanceMeters != null && medianDistanceMeters > 1000) {
    warnings.push('Overlapping points are far apart. This may be a different route.');
  }
  if (overlapMs === 0) {
    warnings.push('Trips do not overlap in time; only adjacent coverage can be checked.');
  }
  if (coverageGainPoints === 0) {
    warnings.push('The second trip does not fill a clear gap in the primary trip.');
  }

  return {
    overlapMs,
    overlapPercent,
    matchedSamples: distances.length,
    medianDistanceMeters,
    confidence,
    coverageGainPoints,
    warnings,
  };
}

function pointLooksDuplicate(existing: FusionPoint[], candidate: FusionPoint): boolean {
  return existing.some((point) => {
    const deltaMs = Math.abs(point.timestamp.getTime() - candidate.timestamp.getTime());
    if (deltaMs > FUSION_DEDUPE_MS) return false;
    return haversineMeters(point.latitude, point.longitude, candidate.latitude, candidate.longitude) <= FUSION_DEDUPE_METERS;
  });
}

function fusePoints(primary: FusionPoint[], secondary: FusionPoint[], gapThresholdMs: number): FusionPoint[] {
  if (primary.length === 0) return [...secondary].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const secondaryFillers: FusionPoint[] = [];
  const first = primary[0]!;
  for (const point of secondary) {
    if (first.timestamp.getTime() - point.timestamp.getTime() > gapThresholdMs) {
      secondaryFillers.push(point);
    }
  }
  for (let i = 1; i < primary.length; i++) {
    const prev = primary[i - 1]!;
    const current = primary[i]!;
    if (current.timestamp.getTime() - prev.timestamp.getTime() > gapThresholdMs) {
      for (const point of secondary) {
        if (
          point.timestamp.getTime() > prev.timestamp.getTime() + FUSION_DEDUPE_MS &&
          point.timestamp.getTime() < current.timestamp.getTime() - FUSION_DEDUPE_MS
        ) {
          secondaryFillers.push(point);
        }
      }
    }
  }
  const last = primary[primary.length - 1]!;
  for (const point of secondary) {
    if (point.timestamp.getTime() - last.timestamp.getTime() > gapThresholdMs) {
      secondaryFillers.push(point);
    }
  }
  const fused = [...primary].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const point of secondaryFillers.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
    if (!pointLooksDuplicate(fused, point)) fused.push(point);
  }
  return fused.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export async function registerTripRoutes(app: FastifyInstance) {
  const mapTripSummary = (
    t: {
      id: string;
      deviceId: string | null;
      device: { id: string; imei: string; name: string | null } | null;
      vehicleId: string | null;
      vehicle: { id: string; name: string } | null;
      startTime: Date;
      endTime: Date;
      name: string | null;
      favorite: boolean;
      source: string;
      createdAt: Date;
    },
  ) => ({
    id: t.id,
    deviceId: t.deviceId,
    device: t.device,
    vehicleId: t.vehicleId,
    vehicle: t.vehicle,
    startTime: t.startTime.toISOString(),
    endTime: t.endTime.toISOString(),
    name: t.name,
    favorite: t.favorite,
    source: t.source,
    createdAt: t.createdAt.toISOString(),
  });

  // List trips with optional filters
  app.get<{ Querystring: unknown }>('/api/v1/trips', async (request, reply) => {
    const q = validate(request.query, ListTripsQuerySchema) as {
      vehicleId?: string;
      deviceId?: string;
      favorite?: 'true' | 'false';
      from?: string;
      to?: string;
      page: number;
      limit: number;
    };
    const prisma = getPrismaClient();
    const where: {
      vehicleId?: string;
      deviceId?: string;
      favorite?: boolean;
      startTime?: { gte?: Date; lte?: Date };
    } = {};
    if (q.vehicleId) where.vehicleId = q.vehicleId;
    if (q.deviceId) where.deviceId = q.deviceId;
    if (q.favorite === 'true') where.favorite = true;
    if (q.favorite === 'false') where.favorite = false;
    if (q.from || q.to) {
      where.startTime = {};
      if (q.from) where.startTime.gte = new Date(q.from);
      if (q.to) where.startTime.lte = new Date(q.to);
    }
    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip: getOffset(q.page, q.limit),
        take: q.limit,
        include: {
          device: { select: { id: true, imei: true, name: true } },
          vehicle: { select: { id: true, name: true } },
        },
      }),
      prisma.trip.count({ where }),
    ]);
    const pages = Math.ceil(total / q.limit);
    return reply.status(200).send({
      data: trips.map(mapTripSummary),
      pagination: {
        total,
        page: q.page,
        limit: q.limit,
        pages,
        hasNextPage: q.page < pages,
        hasPreviousPage: q.page > 1,
      },
    });
  });

  // Create trip (manual: device + start/end + optional vehicle)
  app.post<{ Body: unknown }>('/api/v1/trips', async (request, reply) => {
    const body = validate(request.body, CreateTripSchema) as {
      deviceId: string;
      startTime: string;
        endTime: string;
        vehicleId?: string | null;
        name?: string | null;
        favorite?: boolean;
      };
    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);
    if (endTime.getTime() <= startTime.getTime()) {
      return reply.status(400).send({ error: 'endTime must be after startTime' });
    }
    const prisma = getPrismaClient();
    const device = await prisma.device.findUnique({ where: { id: body.deviceId } });
    if (!device) return reply.status(400).send({ error: 'Device not found' });
    if (body.vehicleId) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: body.vehicleId } });
      if (!vehicle) return reply.status(400).send({ error: 'Vehicle not found' });
    }
    const trip = await prisma.trip.create({
      data: {
        deviceId: body.deviceId,
        vehicleId: body.vehicleId ?? undefined,
        startTime,
        endTime,
        name: body.name ?? undefined,
        favorite: body.favorite ?? false,
        source: 'device',
      },
      include: {
        device: { select: { id: true, imei: true, name: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });
    return reply.status(201).send({ trip: mapTripSummary(trip) });
  });

  // Get single trip with positions and stats
  app.get<{ Params: { id: string } }>('/api/v1/trips/:id', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        device: { select: { id: true, imei: true, name: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });
    if (!trip) throw new NotFoundError('Trip', id);

    let positions: Array<{
      latitude: number;
      longitude: number;
      timestamp: Date;
      speed: number | null;
      attributes?: Record<string, unknown> | null;
    }>;
    if (trip.source === 'imported') {
      const tripPositions = await prisma.tripPosition.findMany({
        where: { tripId: id },
        orderBy: { sortOrder: 'asc' },
      });
      positions = tripPositions.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        timestamp: p.timestamp,
        speed: p.speed,
        attributes: null,
      }));
    } else {
      if (!trip.deviceId) {
        return reply.status(400).send({ error: 'Trip has no device' });
      }
      const posList = await prisma.position.findMany({
        where: {
          deviceId: trip.deviceId,
          timestamp: { gte: trip.startTime, lte: trip.endTime },
        },
        orderBy: { timestamp: 'asc' },
      });
      positions = posList.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        timestamp: p.timestamp,
        speed: p.speed,
        attributes: (p.attributes as Record<string, unknown> | null) ?? null,
      }));
    }

    positions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const stats = computeTripStats(
      positions.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        timestamp: p.timestamp,
        speed: p.speed ?? undefined,
      }))
    );

    const tripStops = await prisma.tripStop.findMany({
      where: { tripId: id },
      orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
    });
    const mergedGaps = trip.deviceId
      ? await prisma.tripMerge.findMany({
          where: {
            deviceId: trip.deviceId,
            gapAfter: { gte: trip.startTime, lte: trip.endTime },
            gapBefore: { gte: trip.startTime, lte: trip.endTime },
          },
          orderBy: { gapAfter: 'asc' },
        })
      : [];

    const adjacencyWhere = trip.vehicleId
      ? { vehicleId: trip.vehicleId }
      : trip.deviceId
        ? { deviceId: trip.deviceId }
        : {};

    const [previousTrip, nextTrip] = await Promise.all([
      prisma.trip.findFirst({
        where: {
          ...adjacencyWhere,
          startTime: { lt: trip.startTime },
        },
        orderBy: { startTime: 'desc' },
        include: {
          device: { select: { id: true, imei: true, name: true } },
          vehicle: { select: { id: true, name: true } },
        },
      }),
      prisma.trip.findFirst({
        where: {
          ...adjacencyWhere,
          startTime: { gt: trip.startTime },
        },
        orderBy: { startTime: 'asc' },
        include: {
          device: { select: { id: true, imei: true, name: true } },
          vehicle: { select: { id: true, name: true } },
        },
      }),
    ]);

    return reply.status(200).send({
      trip: mapTripSummary(trip),
      positions: positions.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        timestamp: p.timestamp.toISOString(),
        speed: p.speed,
        attributes: p.attributes ?? undefined,
      })),
      stats: {
        odometerKm: stats.odometerKm,
        maxSpeedKmh: stats.maxSpeedKmh,
        avgSpeedKmh: stats.avgSpeedKmh,
        pointCount: stats.pointCount,
      },
      stops: tripStops.map((s) => ({
        id: s.id,
        label: s.label,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime?.toISOString() ?? null,
        latitude: s.latitude,
        longitude: s.longitude,
        sortOrder: s.sortOrder,
      })),
      mergedGaps: mergedGaps.map((gap) => ({
        gapAfter: gap.gapAfter.toISOString(),
        gapBefore: gap.gapBefore.toISOString(),
      })),
      adjacentTrips: {
        previous: previousTrip ? mapTripSummary(previousTrip) : null,
        next: nextTrip ? mapTripSummary(nextTrip) : null,
      },
    });
  });

  // Update trip (name, startTime, endTime)
  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id', async (request, reply) => {
    const { id } = request.params;
    const body = validate(request.body, UpdateTripSchema) as {
      name?: string | null;
      favorite?: boolean;
      startTime?: string;
      endTime?: string;
    };
    const prisma = getPrismaClient();
    const trip = await prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip', id);

    const data: { name?: string | null; favorite?: boolean; startTime?: Date; endTime?: Date } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.favorite !== undefined) data.favorite = body.favorite;
    if (body.startTime != null) data.startTime = new Date(body.startTime);
    if (body.endTime != null) data.endTime = new Date(body.endTime);

    if (data.startTime != null && data.endTime != null && data.endTime.getTime() <= data.startTime.getTime()) {
      return reply.status(400).send({ error: 'endTime must be after startTime' });
    }
    if (data.startTime != null && data.endTime == null && trip.endTime.getTime() <= data.startTime.getTime()) {
      return reply.status(400).send({ error: 'startTime must be before existing endTime' });
    }
    if (data.endTime != null && data.startTime == null && data.endTime.getTime() <= trip.startTime.getTime()) {
      return reply.status(400).send({ error: 'endTime must be after existing startTime' });
    }

    const updated = await prisma.trip.update({
      where: { id },
      data,
      include: {
        device: { select: { id: true, imei: true, name: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });
    return reply.status(200).send({ trip: mapTripSummary(updated) });
  });

  // Add stop to trip
  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id/stops', async (request, reply) => {
    const { id } = request.params;
    const body = validate(request.body, CreateTripStopSchema) as CreateTripStopRequest;
    const prisma = getPrismaClient();
    const trip = await prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip', id);
    const startTime = new Date(body.startTime);
    if (startTime.getTime() < trip.startTime.getTime() || startTime.getTime() > trip.endTime.getTime()) {
      return reply.status(400).send({ error: 'Stop startTime must be within trip time range' });
    }
    let endTime: Date | null = null;
    if (body.endTime) {
      const et = new Date(body.endTime);
      if (et.getTime() <= startTime.getTime()) {
        return reply.status(400).send({ error: 'Stop endTime must be after startTime' });
      }
      if (et.getTime() > trip.endTime.getTime()) {
        return reply.status(400).send({ error: 'Stop endTime must be within trip time range' });
      }
      endTime = et;
    }
    const maxOrder = await prisma.tripStop.aggregate({ where: { tripId: id }, _max: { sortOrder: true } });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    const stop = await prisma.tripStop.create({
      data: {
        tripId: id,
        label: body.label,
        startTime,
        endTime,
        latitude: body.latitude,
        longitude: body.longitude,
        sortOrder,
      },
    });
    return reply.status(201).send({
      stop: {
        id: stop.id,
        label: stop.label,
        startTime: stop.startTime.toISOString(),
        endTime: stop.endTime?.toISOString() ?? null,
        latitude: stop.latitude,
        longitude: stop.longitude,
        sortOrder: stop.sortOrder,
      },
    });
  });

  // Update trip stop (label, endTime)
  app.patch<{ Params: { id: string; stopId: string }; Body: unknown }>('/api/v1/trips/:id/stops/:stopId', async (request, reply) => {
    const { id, stopId } = request.params;
    const body = validate(request.body, UpdateTripStopSchema) as UpdateTripStopRequest;
    const prisma = getPrismaClient();
    const stop = await prisma.tripStop.findFirst({ where: { id: stopId, tripId: id } });
    if (!stop) throw new NotFoundError('Trip stop', stopId);
    const trip = await prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip', id);
    const data: { label?: string; endTime?: Date | null } = {};
    if (body.label !== undefined) data.label = body.label;
    if (body.endTime !== undefined) {
      if (body.endTime === null || body.endTime === '') {
        data.endTime = null;
      } else {
        const endTime = new Date(body.endTime);
        if (endTime.getTime() <= stop.startTime.getTime()) {
          return reply.status(400).send({ error: 'Stop endTime must be after startTime' });
        }
        if (endTime.getTime() > trip.endTime.getTime()) {
          return reply.status(400).send({ error: 'Stop endTime must be within trip time range' });
        }
        data.endTime = endTime;
      }
    }
    const updated = await prisma.tripStop.update({
      where: { id: stopId },
      data,
    });
    return reply.status(200).send({
      stop: {
        id: updated.id,
        label: updated.label,
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime?.toISOString() ?? null,
        latitude: updated.latitude,
        longitude: updated.longitude,
        sortOrder: updated.sortOrder,
      },
    });
  });

  // Delete trip stop
  app.delete<{ Params: { id: string; stopId: string } }>('/api/v1/trips/:id/stops/:stopId', async (request, reply) => {
    const { id, stopId } = request.params;
    const prisma = getPrismaClient();
    const stop = await prisma.tripStop.findFirst({ where: { id: stopId, tripId: id } });
    if (!stop) throw new NotFoundError('Trip stop', stopId);
    await prisma.tripStop.delete({ where: { id: stopId } });
    return reply.status(204).send();
  });

  // Split trip at a time: creates two trips and deletes the original
  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id/split', async (request, reply) => {
    const { id } = request.params;
    const body = validate(request.body, SplitTripSchema) as SplitTripRequest;
    const splitAt = new Date(body.splitAt);
    const prisma = getPrismaClient();
    const trip = await prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip', id);
    const startT = trip.startTime.getTime();
    const endT = trip.endTime.getTime();
    const splitT = splitAt.getTime();
    if (splitT <= startT || splitT >= endT) {
      return reply.status(400).send({ error: 'splitAt must be strictly between trip startTime and endTime' });
    }
    if (trip.source === 'imported') {
      const positions = await prisma.tripPosition.findMany({
        where: { tripId: id },
        orderBy: { sortOrder: 'asc' },
      });
      const idx = positions.findIndex((p) => new Date(p.timestamp).getTime() >= splitT);
      if (idx <= 0 || idx >= positions.length) {
        return reply.status(400).send({ error: 'splitAt does not fall between two positions' });
      }
      const firstPart = positions.slice(0, idx);
      const secondPart = positions.slice(idx);
      const firstEnd = firstPart[firstPart.length - 1]!.timestamp;
      const secondStart = secondPart[0]!.timestamp;
      const [trip1, trip2] = await prisma.$transaction([
        prisma.trip.create({
          data: {
            deviceId: trip.deviceId,
            vehicleId: trip.vehicleId,
            startTime: trip.startTime,
            endTime: firstEnd,
            name: trip.name ? `${trip.name} (1)` : null,
            source: 'imported',
            positions: {
              create: firstPart.map((p, i) => ({
                latitude: p.latitude,
                longitude: p.longitude,
                timestamp: p.timestamp,
                speed: p.speed,
                sortOrder: i,
              })),
            },
          },
          include: { vehicle: { select: { id: true, name: true } } },
        }),
        prisma.trip.create({
          data: {
            deviceId: trip.deviceId,
            vehicleId: trip.vehicleId,
            startTime: secondStart,
            endTime: trip.endTime,
            name: trip.name ? `${trip.name} (2)` : null,
            source: 'imported',
            positions: {
              create: secondPart.map((p, i) => ({
                latitude: p.latitude,
                longitude: p.longitude,
                timestamp: p.timestamp,
                speed: p.speed,
                sortOrder: i,
              })),
            },
          },
          include: { vehicle: { select: { id: true, name: true } } },
        }),
      ]);
      await prisma.trip.delete({ where: { id } });
      return reply.status(201).send({
        trips: [
          {
            id: trip1.id,
            startTime: trip1.startTime.toISOString(),
            endTime: trip1.endTime.toISOString(),
            name: trip1.name,
          },
          {
            id: trip2.id,
            startTime: trip2.startTime.toISOString(),
            endTime: trip2.endTime.toISOString(),
            name: trip2.name,
          },
        ],
      });
    }
    // Device trip: create two trips with new time ranges (positions come from Position table)
    const [trip1, trip2] = await prisma.$transaction([
      prisma.trip.create({
        data: {
          deviceId: trip.deviceId,
          vehicleId: trip.vehicleId,
          startTime: trip.startTime,
          endTime: splitAt,
          name: trip.name ? `${trip.name} (1)` : null,
          source: 'device',
        },
        include: { device: { select: { id: true, imei: true, name: true } }, vehicle: { select: { id: true, name: true } } },
      }),
      prisma.trip.create({
        data: {
          deviceId: trip.deviceId,
          vehicleId: trip.vehicleId,
          startTime: splitAt,
          endTime: trip.endTime,
          name: trip.name ? `${trip.name} (2)` : null,
          source: 'device',
        },
        include: { device: { select: { id: true, imei: true, name: true } }, vehicle: { select: { id: true, name: true } } },
      }),
    ]);
    await prisma.trip.delete({ where: { id } });
    return reply.status(201).send({
      trips: [
        { id: trip1.id, startTime: trip1.startTime.toISOString(), endTime: trip1.endTime.toISOString(), name: trip1.name },
        { id: trip2.id, startTime: trip2.startTime.toISOString(), endTime: trip2.endTime.toISOString(), name: trip2.name },
      ],
    });
  });

  // Merge this trip with another adjacent/related trip.
  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id/merge', async (request, reply) => {
    const { id } = request.params;
    const body = validate(request.body, MergeTripsSchema) as MergeTripsRequest;
    if (body.targetTripId === id) {
      return reply.status(400).send({ error: 'targetTripId must be different from source trip id' });
    }

    const prisma = getPrismaClient();
    const [sourceTrip, targetTrip] = await Promise.all([
      prisma.trip.findUnique({ where: { id } }),
      prisma.trip.findUnique({ where: { id: body.targetTripId } }),
    ]);
    if (!sourceTrip) throw new NotFoundError('Trip', id);
    if (!targetTrip) throw new NotFoundError('Trip', body.targetTripId);

    if (sourceTrip.source !== targetTrip.source) {
      return reply.status(400).send({ error: 'Trips must have the same source type to merge' });
    }

    const sameVehicle = sourceTrip.vehicleId != null && targetTrip.vehicleId != null && sourceTrip.vehicleId === targetTrip.vehicleId;
    const sameDevice = sourceTrip.deviceId != null && targetTrip.deviceId != null && sourceTrip.deviceId === targetTrip.deviceId;
    if (!sameVehicle && !sameDevice) {
      return reply.status(400).send({ error: 'Trips must share the same vehicle or device to merge' });
    }
    if (
      sourceTrip.vehicleId != null &&
      targetTrip.vehicleId != null &&
      sourceTrip.vehicleId !== targetTrip.vehicleId
    ) {
      return reply.status(400).send({ error: 'Trips linked to different vehicles cannot be merged' });
    }
    if (
      sourceTrip.deviceId != null &&
      targetTrip.deviceId != null &&
      sourceTrip.deviceId !== targetTrip.deviceId
    ) {
      return reply.status(400).send({ error: 'Trips linked to different devices cannot be merged' });
    }

    const [sourceStops, targetStops, sourcePositions, targetPositions] = await Promise.all([
      prisma.tripStop.findMany({ where: { tripId: sourceTrip.id }, orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }] }),
      prisma.tripStop.findMany({ where: { tripId: targetTrip.id }, orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }] }),
      sourceTrip.source === 'imported'
        ? prisma.tripPosition.findMany({ where: { tripId: sourceTrip.id }, orderBy: [{ timestamp: 'asc' }, { sortOrder: 'asc' }] })
        : Promise.resolve([]),
      targetTrip.source === 'imported'
        ? prisma.tripPosition.findMany({ where: { tripId: targetTrip.id }, orderBy: [{ timestamp: 'asc' }, { sortOrder: 'asc' }] })
        : Promise.resolve([]),
    ]);

    const mergedStart = new Date(Math.min(sourceTrip.startTime.getTime(), targetTrip.startTime.getTime()));
    const mergedEnd = new Date(Math.max(sourceTrip.endTime.getTime(), targetTrip.endTime.getTime()));
    const mergedName = sourceTrip.name ?? targetTrip.name ?? null;
    const mergedFavorite = sourceTrip.favorite || targetTrip.favorite;
    const mergedVehicleId =
      sourceTrip.vehicleId != null && targetTrip.vehicleId != null
        ? sourceTrip.vehicleId
        : sourceTrip.vehicleId ?? targetTrip.vehicleId;
    const mergedDeviceId =
      sourceTrip.deviceId != null && targetTrip.deviceId != null
        ? sourceTrip.deviceId
        : sourceTrip.deviceId ?? targetTrip.deviceId;

    const mergedTrip = await prisma.$transaction(async (tx) => {
      const earlierTrip =
        sourceTrip.endTime.getTime() <= targetTrip.startTime.getTime()
          ? sourceTrip
          : targetTrip.endTime.getTime() <= sourceTrip.startTime.getTime()
            ? targetTrip
            : sourceTrip.startTime.getTime() <= targetTrip.startTime.getTime()
              ? sourceTrip
              : targetTrip;
      const laterTrip = earlierTrip.id === sourceTrip.id ? targetTrip : sourceTrip;
      const created = await tx.trip.create({
        data: {
          deviceId: mergedDeviceId,
          vehicleId: mergedVehicleId,
          startTime: mergedStart,
          endTime: mergedEnd,
          name: mergedName,
          favorite: mergedFavorite,
          source: sourceTrip.source,
        },
      });

      const mergedStops = [...sourceStops, ...targetStops].sort((a, b) => {
        const byStart = a.startTime.getTime() - b.startTime.getTime();
        if (byStart !== 0) return byStart;
        return a.sortOrder - b.sortOrder;
      });
      if (mergedStops.length > 0) {
        await tx.tripStop.createMany({
          data: mergedStops.map((stop, index) => ({
            tripId: created.id,
            label: stop.label,
            startTime: stop.startTime,
            endTime: stop.endTime,
            latitude: stop.latitude,
            longitude: stop.longitude,
            sortOrder: index,
          })),
        });
      }

      if (sourceTrip.source === 'imported') {
        const mergedPositions = [...sourcePositions, ...targetPositions].sort((a, b) => {
          const byTime = a.timestamp.getTime() - b.timestamp.getTime();
          if (byTime !== 0) return byTime;
          return a.sortOrder - b.sortOrder;
        });
        if (mergedPositions.length > 0) {
          await tx.tripPosition.createMany({
            data: mergedPositions.map((position, index) => ({
              tripId: created.id,
              latitude: position.latitude,
              longitude: position.longitude,
              timestamp: position.timestamp,
              speed: position.speed,
              sortOrder: index,
            })),
          });
        }
      }

      if (
        mergedDeviceId &&
        earlierTrip.endTime.getTime() < laterTrip.startTime.getTime()
      ) {
        await tx.tripMerge.createMany({
          data: [{
            deviceId: mergedDeviceId,
            gapAfter: earlierTrip.endTime,
            gapBefore: laterTrip.startTime,
          }],
          skipDuplicates: true,
        });
      }

      await tx.trip.deleteMany({
        where: { id: { in: [sourceTrip.id, targetTrip.id] } },
      });

      return tx.trip.findUnique({
        where: { id: created.id },
        include: {
          device: { select: { id: true, imei: true, name: true } },
          vehicle: { select: { id: true, name: true } },
        },
      });
    });

    if (!mergedTrip) {
      return reply.status(500).send({ error: 'Failed to merge trips' });
    }

    return reply.status(201).send({
      trip: mapTripSummary(mergedTrip),
      mergedTripId: mergedTrip.id,
      deletedTripIds: [sourceTrip.id, targetTrip.id],
    });
  });

  app.get<{ Params: { id: string } }>('/api/v1/trips/:id/fusion-candidates', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const sourceTrip = await prisma.trip.findUnique({
      where: { id },
      include: {
        device: { select: { id: true, imei: true, name: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });
    if (!sourceTrip) throw new NotFoundError('Trip', id);
    const sourcePoints = await loadTripFusionPoints(prisma, sourceTrip);
    const windowPaddingMs = 6 * 60 * 60 * 1000;
    const candidateTrips = await prisma.trip.findMany({
      where: {
        id: { not: id },
        startTime: { lte: new Date(sourceTrip.endTime.getTime() + windowPaddingMs) },
        endTime: { gte: new Date(sourceTrip.startTime.getTime() - windowPaddingMs) },
        ...(sourceTrip.vehicleId ? { vehicleId: sourceTrip.vehicleId } : {}),
      },
      orderBy: { startTime: 'asc' },
      take: 20,
      include: {
        device: { select: { id: true, imei: true, name: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });

    const candidates: Array<{
      trip: ReturnType<typeof mapTripSummary>;
      pointCount: number;
    } & FusionEvaluation> = [];
    for (const candidateTrip of candidateTrips) {
      if (sourceTrip.deviceId && candidateTrip.deviceId && sourceTrip.deviceId === candidateTrip.deviceId) {
        continue;
      }
      const candidatePoints = await loadTripFusionPoints(prisma, candidateTrip);
      if (candidatePoints.length < 2) continue;
      const evaluation = evaluateFusionCandidate(
        sourceTrip,
        candidateTrip,
        sourcePoints,
        candidatePoints,
        5 * 60 * 1000,
      );
      candidates.push({
        trip: mapTripSummary(candidateTrip),
        pointCount: candidatePoints.length,
        ...evaluation,
      });
    }

    candidates.sort((left, right) => {
      const rank = { high: 0, medium: 1, low: 2 };
      const byConfidence = rank[left.confidence] - rank[right.confidence];
      if (byConfidence !== 0) return byConfidence;
      return right.coverageGainPoints - left.coverageGainPoints;
    });

    return reply.status(200).send({ candidates });
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/trips/:id/fuse', async (request, reply) => {
    const { id } = request.params;
    const body = validate(request.body, FuseTripsSchema) as FuseTripsRequest;
    if (body.targetTripId === id) {
      return reply.status(400).send({ error: 'targetTripId must be different from source trip id' });
    }
    if (body.primaryTripId && body.primaryTripId !== id && body.primaryTripId !== body.targetTripId) {
      return reply.status(400).send({ error: 'primaryTripId must be one of the selected trips' });
    }

    const prisma = getPrismaClient();
    const [sourceTrip, targetTrip] = await Promise.all([
      prisma.trip.findUnique({
        where: { id },
        include: {
          device: { select: { id: true, imei: true, name: true } },
          vehicle: { select: { id: true, name: true } },
        },
      }),
      prisma.trip.findUnique({
        where: { id: body.targetTripId },
        include: {
          device: { select: { id: true, imei: true, name: true } },
          vehicle: { select: { id: true, name: true } },
        },
      }),
    ]);
    if (!sourceTrip) throw new NotFoundError('Trip', id);
    if (!targetTrip) throw new NotFoundError('Trip', body.targetTripId);
    if (sourceTrip.deviceId && targetTrip.deviceId && sourceTrip.deviceId === targetTrip.deviceId) {
      return reply.status(400).send({ error: 'Fusion is for trips from different trackers. Use merge for same-device trips.' });
    }
    if (sourceTrip.vehicleId && targetTrip.vehicleId && sourceTrip.vehicleId !== targetTrip.vehicleId) {
      return reply.status(400).send({ error: 'Trips linked to different vehicles cannot be fused' });
    }

    const [sourcePoints, targetPoints] = await Promise.all([
      loadTripFusionPoints(prisma, sourceTrip),
      loadTripFusionPoints(prisma, targetTrip),
    ]);
    if (sourcePoints.length < 2 || targetPoints.length < 2) {
      return reply.status(400).send({ error: 'Both trips need at least two points to fuse' });
    }

    const gapThresholdMs = body.gapThresholdMinutes * 60 * 1000;
    const evaluation = evaluateFusionCandidate(sourceTrip, targetTrip, sourcePoints, targetPoints, gapThresholdMs);
    if (evaluation.confidence === 'low') {
      return reply.status(400).send({ error: 'Trips do not look similar enough to fuse safely' });
    }

    const primaryTripId = body.primaryTripId ?? id;
    const primaryPoints = primaryTripId === id ? sourcePoints : targetPoints;
    const secondaryPoints = primaryTripId === id ? targetPoints : sourcePoints;
    const fusedPoints = fusePoints(primaryPoints, secondaryPoints, gapThresholdMs);
    if (fusedPoints.length < 2) {
      return reply.status(400).send({ error: 'Fusion did not produce enough points' });
    }

    const mergedVehicleId = sourceTrip.vehicleId ?? targetTrip.vehicleId ?? null;
    const firstPoint = fusedPoints[0]!;
    const lastPoint = fusedPoints[fusedPoints.length - 1]!;
    const defaultName = `Fused: ${sourceTrip.name ?? tripLabel(sourceTrip)} + ${targetTrip.name ?? tripLabel(targetTrip)}`;
    const created = await prisma.trip.create({
      data: {
        deviceId: null,
        vehicleId: mergedVehicleId ?? undefined,
        startTime: firstPoint.timestamp,
        endTime: lastPoint.timestamp,
        name: body.name ?? defaultName,
        favorite: sourceTrip.favorite || targetTrip.favorite,
        source: 'imported',
        positions: {
          create: fusedPoints.map((point, index) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            timestamp: point.timestamp,
            speed: point.speed,
            sortOrder: index,
          })),
        },
      },
      include: {
        device: { select: { id: true, imei: true, name: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });

    return reply.status(201).send({
      trip: mapTripSummary(created),
      fusedTripId: created.id,
      pointCount: fusedPoints.length,
      evaluation,
    });
  });

  // Delete trip
  app.delete<{ Params: { id: string } }>('/api/v1/trips/:id', async (request, reply) => {
    const { id } = request.params;
    const prisma = getPrismaClient();
    const trip = await prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip', id);
    await prisma.trip.delete({ where: { id } });
    return reply.status(204).send();
  });

  // Import GPX as trip (multipart: file; optional vehicleId, name in body or query)
  app.post<{ Querystring: { vehicleId?: string; name?: string }; Body: unknown }>(
    '/api/v1/trips/import-gpx',
    async (request, reply) => {
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'GPX file required' });
      const buffer = await data.toBuffer();
      const xml = buffer.toString('utf-8');
      const points = parseGpxTrackPoints(xml);
      if (points.length < 2) {
        return reply.status(400).send({ error: 'GPX must contain at least 2 track points' });
      }
      const vehicleId = request.query?.vehicleId;
      const name = request.query?.name ?? data.filename ?? 'Imported';

      const prisma = getPrismaClient();
      if (vehicleId) {
        const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
        if (!vehicle) return reply.status(400).send({ error: 'Vehicle not found' });
      }

      const startTime = points[0]!.timestamp;
      const endTime = points[points.length - 1]!.timestamp;

      const trip = await prisma.trip.create({
        data: {
          deviceId: null,
          vehicleId: vehicleId ?? undefined,
          startTime,
          endTime,
          name: name || undefined,
          source: 'imported',
          positions: {
            create: points.map((p, i) => ({
              latitude: p.latitude,
              longitude: p.longitude,
              timestamp: p.timestamp,
              speed: p.speed ?? undefined,
              sortOrder: i,
            })),
          },
        },
        include: {
          vehicle: { select: { id: true, name: true } },
        },
      });

      return reply.status(201).send({
        trip: {
          id: trip.id,
          deviceId: trip.deviceId,
          vehicleId: trip.vehicleId,
          vehicle: trip.vehicle,
          startTime: trip.startTime.toISOString(),
          endTime: trip.endTime.toISOString(),
          name: trip.name,
          source: trip.source,
          createdAt: trip.createdAt.toISOString(),
        },
      });
    }
  );
}
