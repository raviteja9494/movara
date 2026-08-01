import type { Prisma, PrismaClient } from '@prisma/client';
import { Trip, type NewTrip, type TripPoint, type TripStop } from '../../domain/entities';
import type { StopInput, TripFilters, TripRepository } from '../../domain/repositories';

const relationInclude = { device: { select: { id: true, imei: true, name: true } }, vehicle: { select: { id: true, name: true } } } as const;
type TripRow = Prisma.TripGetPayload<{ include: typeof relationInclude }>;
const toTrip = (row: TripRow) => new Trip(row.id, row.userId, row.deviceId, row.device, row.vehicleId, row.vehicle, row.startTime, row.endTime, row.name, row.favorite, row.source, row.createdAt);
const toStop = (row: { id: string; tripId: string; label: string; startTime: Date; endTime: Date | null; latitude: number; longitude: number; sortOrder: number }): TripStop => row;

export class PrismaTripRepository implements TripRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, filters: TripFilters, offset: number, limit: number) {
    const where = {
      userId,
      ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}), ...(filters.deviceId ? { deviceId: filters.deviceId } : {}),
      ...(filters.favorite !== undefined ? { favorite: filters.favorite } : {}),
      ...(filters.from || filters.to ? { startTime: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.trip.findMany({ where, orderBy: { startTime: 'desc' }, skip: offset, take: limit, include: relationInclude }),
      this.prisma.trip.count({ where }),
    ]);
    return { items: rows.map(toTrip), total };
  }

  async findById(userId: string, id: string) { const row = await this.prisma.trip.findFirst({ where: { id, userId }, include: relationInclude }); return row ? toTrip(row) : null; }
  async deviceExists(userId: string, id: string) { return (await this.prisma.device.count({ where: { id, userId } })) > 0; }
  async vehicleExists(userId: string, id: string) { return (await this.prisma.vehicle.count({ where: { id, userId } })) > 0; }

  async create(data: NewTrip) {
    const row = await this.prisma.trip.create({
      data: {
        userId: data.userId,
        deviceId: data.deviceId ?? undefined, vehicleId: data.vehicleId ?? undefined, startTime: data.startTime,
        endTime: data.endTime, name: data.name ?? undefined, favorite: data.favorite ?? false, source: data.source,
        ...(data.positions ? { positions: { create: data.positions.map((p, index) => ({ userId: data.userId, latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp, speed: p.speed ?? undefined, sortOrder: index })) } } : {}),
      }, include: relationInclude,
    });
    return toTrip(row);
  }

  async update(userId: string, id: string, data: { name?: string | null; favorite?: boolean; startTime?: Date; endTime?: Date }) {
    await this.prisma.trip.updateMany({ where: { id, userId }, data });
    return toTrip(await this.prisma.trip.findFirstOrThrow({ where: { id, userId }, include: relationInclude }));
  }
  async delete(userId: string, id: string) { await this.prisma.trip.deleteMany({ where: { id, userId } }); }

  async loadPoints(userId: string, trip: Trip): Promise<TripPoint[]> {
    if (trip.source === 'imported') return this.prisma.tripPosition.findMany({ where: { userId, tripId: trip.id }, orderBy: [{ timestamp: 'asc' }, { sortOrder: 'asc' }] });
    if (!trip.deviceId) return [];
    const rows = await this.prisma.position.findMany({ where: { userId, deviceId: trip.deviceId, timestamp: { gte: trip.startTime, lte: trip.endTime } }, orderBy: { timestamp: 'asc' } });
    return rows.map((row) => ({ latitude: row.latitude, longitude: row.longitude, timestamp: row.timestamp, speed: row.speed, attributes: row.attributes as Record<string, unknown> | null }));
  }
  async loadStops(userId: string, tripId: string) { return (await this.prisma.tripStop.findMany({ where: { userId, tripId }, orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }] })).map(toStop); }
  async loadMergedGaps(userId: string, trip: Trip) {
    if (!trip.deviceId) return [];
    return this.prisma.tripMerge.findMany({ where: { userId, deviceId: trip.deviceId, gapAfter: { gte: trip.startTime, lte: trip.endTime }, gapBefore: { gte: trip.startTime, lte: trip.endTime } }, orderBy: { gapAfter: 'asc' } });
  }
  async findAdjacent(userId: string, trip: Trip) {
    const identity = trip.vehicleId ? { vehicleId: trip.vehicleId } : trip.deviceId ? { deviceId: trip.deviceId } : {};
    const [previous, next] = await Promise.all([
      this.prisma.trip.findFirst({ where: { userId, ...identity, startTime: { lt: trip.startTime } }, orderBy: { startTime: 'desc' }, include: relationInclude }),
      this.prisma.trip.findFirst({ where: { userId, ...identity, startTime: { gt: trip.startTime } }, orderBy: { startTime: 'asc' }, include: relationInclude }),
    ]);
    return { previous: previous ? toTrip(previous) : null, next: next ? toTrip(next) : null };
  }

  async findStop(userId: string, tripId: string, stopId: string) { const row = await this.prisma.tripStop.findFirst({ where: { userId, id: stopId, tripId } }); return row ? toStop(row) : null; }
  async createStop(userId: string, tripId: string, input: StopInput) {
    const order = input.sortOrder ?? ((await this.prisma.tripStop.aggregate({ where: { userId, tripId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
    return toStop(await this.prisma.tripStop.create({ data: { userId, tripId, ...input, sortOrder: order } }));
  }
  async updateStop(userId: string, stopId: string, input: Partial<StopInput>) { await this.prisma.tripStop.updateMany({ where: { id: stopId, userId }, data: input }); return toStop(await this.prisma.tripStop.findFirstOrThrow({ where: { id: stopId, userId } })); }
  async deleteStop(userId: string, stopId: string) { await this.prisma.tripStop.deleteMany({ where: { id: stopId, userId } }); }

  async replaceWithSplit(userId: string, originalId: string, parts: NewTrip[]) {
    return this.prisma.$transaction(async (tx) => {
      const created: Trip[] = [];
      for (const part of parts) {
        const row = await tx.trip.create({ data: {
          userId,
          deviceId: part.deviceId ?? undefined, vehicleId: part.vehicleId ?? undefined, startTime: part.startTime,
          endTime: part.endTime, name: part.name ?? undefined, favorite: part.favorite ?? false, source: part.source,
          ...(part.positions ? { positions: { create: part.positions.map((p, index) => ({ userId, latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp, speed: p.speed ?? undefined, sortOrder: index })) } } : {}),
        }, include: relationInclude });
        created.push(toTrip(row));
      }
      await tx.trip.deleteMany({ where: { id: originalId, userId } });
      return created;
    });
  }

  async replaceWithMerge(source: Trip, target: Trip, data: NewTrip, stops: TripStop[], positions: TripPoint[], gap?: { gapAfter: Date; gapBefore: Date }) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.trip.create({ data: { userId: data.userId, deviceId: data.deviceId ?? undefined, vehicleId: data.vehicleId ?? undefined, startTime: data.startTime, endTime: data.endTime, name: data.name ?? undefined, favorite: data.favorite ?? false, source: data.source }, include: relationInclude });
      if (stops.length) await tx.tripStop.createMany({ data: stops.map((stop, index) => ({ userId: data.userId, tripId: row.id, label: stop.label, startTime: stop.startTime, endTime: stop.endTime, latitude: stop.latitude, longitude: stop.longitude, sortOrder: index })) });
      if (positions.length) await tx.tripPosition.createMany({ data: positions.map((point, index) => ({ userId: data.userId, tripId: row.id, latitude: point.latitude, longitude: point.longitude, timestamp: point.timestamp, speed: point.speed, sortOrder: index })) });
      if (gap && data.deviceId) await tx.tripMerge.createMany({ data: [{ userId: data.userId, deviceId: data.deviceId, ...gap }], skipDuplicates: true });
      await tx.trip.deleteMany({ where: { userId: data.userId, id: { in: [source.id, target.id] } } });
      return toTrip(row);
    });
  }

  async findFusionCandidates(userId: string, source: Trip, paddingMs: number, limit: number) {
    const rows = await this.prisma.trip.findMany({ where: { userId, id: { not: source.id }, startTime: { lte: new Date(source.endTime.getTime() + paddingMs) }, endTime: { gte: new Date(source.startTime.getTime() - paddingMs) }, ...(source.vehicleId ? { vehicleId: source.vehicleId } : {}) }, orderBy: { startTime: 'asc' }, take: limit, include: relationInclude });
    return rows.map(toTrip);
  }
}
