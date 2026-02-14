import { FastifyInstance } from 'fastify';
import { PrismaPositionRepository } from '../persistence';
import {
  validate,
  GetPositionsQuerySchema,
  GetPositionStatsQuerySchema,
} from '../../../../shared/validation';
import { computeTripStats } from '../../../../shared/utils';

const positionRepository = new PrismaPositionRepository();

function toPositionDto(p: {
  id: string;
  deviceId: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
  speed: number | null;
  createdAt: Date;
}) {
  return {
    id: p.id,
    deviceId: p.deviceId,
    timestamp: p.timestamp,
    latitude: p.latitude,
    longitude: p.longitude,
    speed: p.speed,
    createdAt: p.createdAt,
  };
}

export async function registerPositionRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>('/api/v1/positions/latest', async (request) => {
    const q = validate(request.query, GetPositionsQuerySchema) as {
      deviceId: string;
      limit: number;
      from?: Date;
      to?: Date;
    };
    let positions;
    if (q.from != null && q.to != null) {
      const list = await positionRepository.findByDeviceIdAndTimeRange(
        q.deviceId,
        q.from,
        q.to
      );
      positions = list.reverse().slice(0, q.limit);
    } else {
      positions = await positionRepository.findByDeviceId(q.deviceId, q.limit);
    }
    return {
      positions: positions.map((p) =>
        toPositionDto({
          id: p.id,
          deviceId: p.deviceId,
          timestamp: p.timestamp,
          latitude: p.latitude,
          longitude: p.longitude,
          speed: p.speed,
          createdAt: p.createdAt,
        })
      ),
    };
  });

  app.get<{ Querystring: unknown }>('/api/v1/positions/stats', async (request) => {
    const q = validate(request.query, GetPositionStatsQuerySchema) as {
      deviceId: string;
      from: Date;
      to: Date;
    };
    const positions = await positionRepository.findByDeviceIdAndTimeRange(
      q.deviceId,
      q.from,
      q.to
    );
    const stats = computeTripStats(
      positions.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        speed: p.speed,
        timestamp: p.timestamp,
      }))
    );
    return {
      from: q.from,
      to: q.to,
      ...stats,
      positions: positions
        .slice()
        .reverse()
        .map((p) =>
          toPositionDto({
            id: p.id,
            deviceId: p.deviceId,
            timestamp: p.timestamp,
            latitude: p.latitude,
            longitude: p.longitude,
            speed: p.speed,
            createdAt: p.createdAt,
          })
        ),
    };
  });
}
