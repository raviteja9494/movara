import { NotFoundError, UnauthorizedError } from '../errors';

export type OwnedResourceType = 'device' | 'vehicle' | 'trip' | 'vehicleRecord' | 'fuelRecord' | 'tripStop';

export interface OwnershipReader {
  findOwnerId(resource: OwnedResourceType, resourceId: string): Promise<string | null>;
}

const labels: Record<OwnedResourceType, string> = {
  device: 'Device',
  vehicle: 'Vehicle',
  trip: 'Trip',
  vehicleRecord: 'VehicleRecord',
  fuelRecord: 'FuelRecord',
  tripStop: 'Trip stop',
};

/** Central tenant boundary. It deliberately returns 404 for foreign resources to avoid leaking their existence. */
export class OwnershipPolicy {
  constructor(private readonly owners: OwnershipReader) {}

  requireActor(userId: string | undefined): string {
    if (!userId) throw new UnauthorizedError('Authentication required');
    return userId;
  }

  async assertOwns(userId: string | undefined, resource: OwnedResourceType, resourceId: string): Promise<void> {
    const actorId = this.requireActor(userId);
    if (await this.owners.findOwnerId(resource, resourceId) !== actorId) {
      throw new NotFoundError(labels[resource], resourceId);
    }
  }
}
