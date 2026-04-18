import { getPrismaClient } from '../../../infrastructure/db';
import { computeTripStats } from '../../../shared/utils';

type VehicleEstimateRecord = {
  id: string;
  estimatedOdometerKm: number | null;
  estimatedOdometerBaseKm: number | null;
  estimatedOdometerBaseAt: Date | null;
  estimatedOdometerUpdatedAt: Date | null;
};

function roundKm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export async function refreshVehicleEstimatedOdometer<T extends VehicleEstimateRecord>(
  vehicle: T,
): Promise<T> {
  if (vehicle.estimatedOdometerBaseKm == null || vehicle.estimatedOdometerBaseAt == null) {
    return vehicle;
  }

  const prisma = getPrismaClient();
  const latestTrip = await prisma.trip.findFirst({
    where: {
      vehicleId: vehicle.id,
      endTime: { gte: vehicle.estimatedOdometerBaseAt },
    },
    orderBy: { endTime: 'desc' },
    select: { endTime: true },
  });

  const baseKm = vehicle.estimatedOdometerBaseKm;
  if (!latestTrip) {
    if (vehicle.estimatedOdometerKm === baseKm && vehicle.estimatedOdometerUpdatedAt != null) {
      return vehicle;
    }
    const estimatedOdometerUpdatedAt = new Date();
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        estimatedOdometerKm: baseKm,
        estimatedOdometerUpdatedAt,
      },
    });
    return {
      ...vehicle,
      estimatedOdometerKm: baseKm,
      estimatedOdometerUpdatedAt,
    };
  }

  if (
    vehicle.estimatedOdometerKm != null &&
    vehicle.estimatedOdometerUpdatedAt != null &&
    vehicle.estimatedOdometerUpdatedAt >= latestTrip.endTime
  ) {
    return vehicle;
  }

  const trips = await prisma.trip.findMany({
    where: {
      vehicleId: vehicle.id,
      endTime: { gte: vehicle.estimatedOdometerBaseAt },
    },
    orderBy: { startTime: 'asc' },
    select: {
      id: true,
      source: true,
      deviceId: true,
      startTime: true,
      endTime: true,
    },
  });

  let totalKm = 0;
  for (const trip of trips) {
    const fromTime =
      trip.startTime > vehicle.estimatedOdometerBaseAt ? trip.startTime : vehicle.estimatedOdometerBaseAt;
    if (trip.source === 'imported') {
      const points = await prisma.tripPosition.findMany({
        where: {
          tripId: trip.id,
          timestamp: { gte: fromTime, lte: trip.endTime },
        },
        orderBy: [{ timestamp: 'asc' }, { sortOrder: 'asc' }],
        select: {
          latitude: true,
          longitude: true,
          timestamp: true,
          speed: true,
        },
      });
      if (points.length >= 2) totalKm += computeTripStats(points).odometerKm;
      continue;
    }
    if (!trip.deviceId) continue;
    const points = await prisma.position.findMany({
      where: {
        deviceId: trip.deviceId,
        timestamp: { gte: fromTime, lte: trip.endTime },
      },
      orderBy: { timestamp: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        timestamp: true,
        speed: true,
      },
    });
    if (points.length >= 2) totalKm += computeTripStats(points).odometerKm;
  }

  const estimatedOdometerKm = roundKm(baseKm + totalKm);
  const estimatedOdometerUpdatedAt = new Date();
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: {
      estimatedOdometerKm,
      estimatedOdometerUpdatedAt,
    },
  });
  return {
    ...vehicle,
    estimatedOdometerKm,
    estimatedOdometerUpdatedAt,
  };
}
