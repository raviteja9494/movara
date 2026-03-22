import { FastifyInstance } from 'fastify';
import {
  validate,
  CreateTripSchema,
  ListTripsQuerySchema,
  UpdateTripSchema,
  SplitTripSchema,
  CreateTripStopSchema,
  UpdateTripStopSchema,
  type SplitTripRequest,
  type CreateTripStopRequest,
  type UpdateTripStopRequest,
} from '../../../../shared/validation';
import { getPrismaClient } from '../../../../infrastructure/db';
import { NotFoundError } from '../../../../shared/errors';
import { computeTripStats } from '../../../../shared/utils';
import { parseGpxTrackPoints } from '../../../../shared/utils/parseGpx';
import { getOffset } from '../../../../shared/utils';

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
    source: t.source,
    createdAt: t.createdAt.toISOString(),
  });

  // List trips with optional filters
  app.get<{ Querystring: unknown }>('/api/v1/trips', async (request, reply) => {
    const q = validate(request.query, ListTripsQuerySchema) as {
      vehicleId?: string;
      deviceId?: string;
      from?: string;
      to?: string;
      page: number;
      limit: number;
    };
    const prisma = getPrismaClient();
    const where: {
      vehicleId?: string;
      deviceId?: string;
      startTime?: { gte?: Date; lte?: Date };
    } = {};
    if (q.vehicleId) where.vehicleId = q.vehicleId;
    if (q.deviceId) where.deviceId = q.deviceId;
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
        source: 'device',
      },
      include: {
        device: { select: { id: true, imei: true, name: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });
    return reply.status(201).send({
      trip: {
        id: trip.id,
        deviceId: trip.deviceId,
        device: trip.device,
        vehicleId: trip.vehicleId,
        vehicle: trip.vehicle,
        startTime: trip.startTime.toISOString(),
        endTime: trip.endTime.toISOString(),
        name: trip.name,
        source: trip.source,
        createdAt: trip.createdAt.toISOString(),
      },
    });
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
      startTime?: string;
      endTime?: string;
    };
    const prisma = getPrismaClient();
    const trip = await prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip', id);

    const data: { name?: string | null; startTime?: Date; endTime?: Date } = {};
    if (body.name !== undefined) data.name = body.name;
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
    return reply.status(200).send({
      trip: {
        id: updated.id,
        deviceId: updated.deviceId,
        device: updated.device,
        vehicleId: updated.vehicleId,
        vehicle: updated.vehicle,
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        name: updated.name,
        source: updated.source,
        createdAt: updated.createdAt.toISOString(),
      },
    });
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
