import type {
  PrismaClient,
  SavedLocation as SavedLocationRow,
} from '@prisma/client';
import { SavedLocation } from '../../domain/entities';
import type {
  SavedLocationRepository,
  SavedLocationUpdate,
} from '../../domain/repositories';

function toDomain(row: SavedLocationRow): SavedLocation {
  return new SavedLocation(
    row.id,
    row.userId,
    row.name,
    row.latitude,
    row.longitude,
    row.notes,
    row.createdAt,
    row.updatedAt,
  );
}

export class PrismaSavedLocationRepository implements SavedLocationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllForUser(userId: string): Promise<SavedLocation[]> {
    const rows = await this.prisma.savedLocation.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toDomain);
  }

  async findById(userId: string, id: string): Promise<SavedLocation | null> {
    const row = await this.prisma.savedLocation.findFirst({ where: { id, userId } });
    return row ? toDomain(row) : null;
  }

  async create(location: SavedLocation): Promise<SavedLocation> {
    return toDomain(await this.prisma.savedLocation.create({
      data: {
        id: location.id,
        userId: location.userId,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        notes: location.notes,
        createdAt: location.createdAt,
      },
    }));
  }

  async update(userId: string, id: string, input: SavedLocationUpdate): Promise<SavedLocation> {
    await this.prisma.savedLocation.updateMany({
      where: { id, userId },
      data: input,
    });
    return toDomain(await this.prisma.savedLocation.findFirstOrThrow({ where: { id, userId } }));
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.savedLocation.deleteMany({ where: { id, userId } });
  }
}
