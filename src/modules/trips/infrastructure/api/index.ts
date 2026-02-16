import { FastifyInstance } from 'fastify';
import {
  validate,
  CreateTripSchema,
  ListTripsQuerySchema,
} from '../../../../shared/validation';
import { getPrismaClient } from '../../../../infrastructure/db';
import { NotFoundError } from '../../../../shared/errors';
import { computeTripStats } from '../../../../shared/utils';
import { parseGpxTrackPoints } from '../../../../shared/utils/parseGpx';
import { getOffset } from '../../../../shared/utils';

export async function registerTripRoutes(app: FastifyInstance) {
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
      data: trips.map((t) => ({
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
      })),
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

    let positions: Array<{ latitude: number; longitude: number; timestamp: Date; speed: number | null }>;
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
      }));
    }

    const stats = computeTripStats(
      positions.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        timestamp: p.timestamp,
        speed: p.speed ?? undefined,
      }))
    );

    return reply.status(200).send({
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
      positions: positions.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        timestamp: p.timestamp.toISOString(),
        speed: p.speed,
      })),
      stats: {
        odometerKm: stats.odometerKm,
        maxSpeedKmh: stats.maxSpeedKmh,
        avgSpeedKmh: stats.avgSpeedKmh,
        pointCount: stats.pointCount,
      },
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
