import type { PrismaClient } from '@prisma/client';
import type { OwnedResourceType, OwnershipReader } from '../../shared/authorization';

export class PrismaOwnershipReader implements OwnershipReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findOwnerId(resource: OwnedResourceType, resourceId: string): Promise<string | null> {
    const select = { userId: true } as const;
    const row = resource === 'device' ? await this.prisma.device.findUnique({ where: { id: resourceId }, select })
      : resource === 'vehicle' ? await this.prisma.vehicle.findUnique({ where: { id: resourceId }, select })
      : resource === 'trip' ? await this.prisma.trip.findUnique({ where: { id: resourceId }, select })
      : resource === 'vehicleRecord' ? await this.prisma.vehicleRecord.findUnique({ where: { id: resourceId }, select })
      : resource === 'fuelRecord' ? await this.prisma.fuelRecord.findUnique({ where: { id: resourceId }, select })
      : await this.prisma.tripStop.findUnique({ where: { id: resourceId }, select });
    return row?.userId ?? null;
  }
}
