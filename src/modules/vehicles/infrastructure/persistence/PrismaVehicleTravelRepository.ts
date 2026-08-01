import type { PrismaClient } from '@prisma/client';
import type { VehicleTravelRepository } from '../../domain/repositories';

export class PrismaVehicleTravelRepository implements VehicleTravelRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findDevicePositions(userId: string, deviceId: string, from: Date, to: Date) {
    return this.prisma.position.findMany({
      where: { userId, deviceId, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: 'asc' },
      select: { latitude: true, longitude: true, timestamp: true, speed: true },
    });
  }

  findTripMerges(userId: string, deviceId: string) {
    return this.prisma.tripMerge.findMany({ where: { userId, deviceId }, orderBy: { gapAfter: 'asc' } });
  }

  createTripMerge(userId: string, deviceId: string, gapAfter: Date, gapBefore: Date) {
    return this.prisma.tripMerge.create({ data: { userId, deviceId, gapAfter, gapBefore } });
  }

  async deleteTripMergesNear(userId: string, deviceId: string, gapAfter: Date, gapBefore: Date, toleranceMs: number): Promise<void> {
    await this.prisma.tripMerge.deleteMany({
      where: {
        userId, deviceId,
        gapAfter: { gte: new Date(gapAfter.getTime() - toleranceMs), lte: new Date(gapAfter.getTime() + toleranceMs) },
        gapBefore: { gte: new Date(gapBefore.getTime() - toleranceMs), lte: new Date(gapBefore.getTime() + toleranceMs) },
      },
    });
  }

  async findLatestStoredTripEnd(userId: string, vehicleId: string, from: Date): Promise<Date | null> {
    return (await this.prisma.trip.findFirst({
      where: { userId, vehicleId, endTime: { gte: from } },
      orderBy: { endTime: 'desc' },
      select: { endTime: true },
    }))?.endTime ?? null;
  }

  findStoredTrips(userId: string, vehicleId: string, from: Date) {
    return this.prisma.trip.findMany({
      where: { userId, vehicleId, endTime: { gte: from } },
      orderBy: { startTime: 'asc' },
      select: { id: true, source: true, deviceId: true, startTime: true, endTime: true },
    });
  }

  findImportedTripPoints(userId: string, tripId: string, from: Date, to: Date) {
    return this.prisma.tripPosition.findMany({
      where: { userId, tripId, timestamp: { gte: from, lte: to } },
      orderBy: [{ timestamp: 'asc' }, { sortOrder: 'asc' }],
      select: { latitude: true, longitude: true, timestamp: true, speed: true },
    });
  }

  async updateEstimatedOdometer(userId: string, vehicleId: string, value: number, updatedAt: Date): Promise<void> {
    await this.prisma.vehicle.updateMany({
      where: { id: vehicleId, userId },
      data: { estimatedOdometerKm: value, estimatedOdometerUpdatedAt: updatedAt },
    });
  }
}
