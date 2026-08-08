import { NotFoundError } from '../../../../shared/errors';
import type { OwnershipPolicy } from '../../../../shared/authorization';
import { SavedLocation, type SavedLocationProps } from '../../domain/entities';
import type {
  SavedLocationRepository,
  SavedLocationUpdate,
} from '../../domain/repositories';

export class LocationUseCases {
  constructor(
    private readonly locations: SavedLocationRepository,
    private readonly ownership: OwnershipPolicy,
  ) {}

  async list(userId: string): Promise<SavedLocation[]> {
    this.ownership.requireActor(userId);
    return this.locations.findAllForUser(userId);
  }

  async get(userId: string, id: string): Promise<SavedLocation> {
    await this.ownership.assertOwns(userId, 'savedLocation', id);
    const location = await this.locations.findById(userId, id);
    if (!location) throw new NotFoundError('SavedLocation', id);
    return location;
  }

  async create(userId: string, input: Omit<SavedLocationProps, 'userId'>): Promise<SavedLocation> {
    this.ownership.requireActor(userId);
    return this.locations.create(SavedLocation.create({
      ...input,
      userId,
      name: input.name.trim(),
    }));
  }

  async update(userId: string, id: string, input: SavedLocationUpdate): Promise<SavedLocation> {
    await this.ownership.assertOwns(userId, 'savedLocation', id);
    return this.locations.update(userId, id, {
      ...input,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.ownership.assertOwns(userId, 'savedLocation', id);
    await this.locations.delete(userId, id);
  }
}
