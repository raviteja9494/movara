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
        ),
    );
  }
}
