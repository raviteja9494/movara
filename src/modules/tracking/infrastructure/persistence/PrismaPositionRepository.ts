import { getPrismaClient } from '../../../../infrastructure/db';
import { Position } from '../../domain/entities';
import { PositionRepository } from '../../domain/repositories';

export class PrismaPositionRepository implements PositionRepository {
  async save(position: Position): Promise<Position> {
    const prisma = getPrismaClient();
    const record = await prisma.position.create({
      data: {
        id: position.id,
        deviceId: position.deviceId,
        timestamp: position.timestamp,
        latitude: position.latitude,
        longitude: position.longitude,
        speed: position.speed,
        attributes: position.attributes != null ? (position.attributes as object) : undefined,
        createdAt: position.createdAt,
      },
    });

    return new Position(
      record.id,
      record.deviceId,
      record.timestamp,
      record.latitude,
      record.longitude,
      record.speed,
      record.createdAt,
      record.attributes as Record<string, unknown> | null ?? null,
    );
  }

  async findByDeviceId(
    deviceId: string,
    limit?: number,
  ): Promise<Position[]> {
    const prisma = getPrismaClient();
    const records = await prisma.position.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return records.map(
      (r) =>
        new Position(
          r.id,
          r.deviceId,
          r.timestamp,
          r.latitude,
          r.longitude,
          r.speed,
          r.createdAt,
          (r.attributes as Record<string, unknown>) ?? null,
        ),
    );
  }

  async findByDeviceIdAndTimeRange(
    deviceId: string,
    from: Date,
    to: Date,
  ): Promise<Position[]> {
    const prisma = getPrismaClient();
    const records = await prisma.position.findMany({
      where: {
        deviceId,
        timestamp: { gte: from, lte: to },
      },
      orderBy: { timestamp: 'asc' },
    });
    return records.map(
      (r) =>
        new Position(
          r.id,
          r.deviceId,
          r.timestamp,
          r.latitude,
          r.longitude,
          r.speed,
          r.createdAt,
          (r.attributes as Record<string, unknown>) ?? null,
        ),
    );
  }
}
