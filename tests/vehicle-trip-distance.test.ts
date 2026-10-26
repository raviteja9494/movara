import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { TripUseCases } from '../src/modules/trips/application/use-cases';
import { PrismaTripRepository } from '../src/modules/trips/infrastructure/persistence/PrismaTripRepository';
import { VehicleUseCases } from '../src/modules/vehicles/application/use-cases';
import { Vehicle } from '../src/modules/vehicles/domain/entities';
import type { StoredVehicleTrip, VehicleRepository, VehicleTravelRepository } from '../src/modules/vehicles/domain/repositories';
import { OwnershipPolicy } from '../src/shared/authorization';

function createVehicleUseCases(trips: StoredVehicleTrip[], points: Array<{ latitude: number; longitude: number; timestamp: Date; speed: number | null }>) {
  const userId = 'user-1';
  const vehicleId = 'vehicle-1';
  const baseAt = new Date(Date.now() - 60 * 60 * 1000);
  const latestEnd = new Date();
  const details = {
    vehicle: new Vehicle(vehicleId, userId, 'Car', null, baseAt, null, null, null, null, null, null, 100,
      100, baseAt, new Date(Date.now() - 10 * 60 * 1000)),
    insuranceRecords: [],
  };
  let positionReads = 0;
  let storedTripReads = 0;
  let distanceWrites = 0;
  const vehicles = { findVehicleDetailsById: async () => details } as unknown as VehicleRepository;
  const travel = {
    findLatestStoredTripEnd: async () => latestEnd,
    findStoredTrips: async () => {
      storedTripReads += 1;
      return trips;
    },
    findDevicePositions: async () => {
      positionReads += 1;
      return points;
    },
    findImportedTripPoints: async () => {
      positionReads += 1;
      return points;
    },
    updateTripDistance: async (_userId: string, tripId: string, distanceKm: number) => {
      distanceWrites += 1;
      const trip = trips.find((item) => item.id === tripId);
      if (trip) trip.distanceKm = distanceKm;
    },
    updateEstimatedOdometer: async () => undefined,
  } as unknown as VehicleTravelRepository;
  const ownership = new OwnershipPolicy({ findOwnerId: async () => userId });
  return {
    useCases: new VehicleUseCases(vehicles, travel, ownership),
    userId,
    vehicleId,
    baseAt,
    get positionReads() { return positionReads; },
    get storedTripReads() { return storedTripReads; },
    get distanceWrites() { return distanceWrites; },
  };
}

test('odometer recompute stores a full trip distance and reuses it next time', async () => {
  const baseAt = new Date(Date.now() - 60 * 60 * 1000);
  const trip: StoredVehicleTrip = {
    id: 'trip-1', source: 'device', deviceId: 'device-1',
    startTime: new Date(baseAt.getTime() + 60_000), endTime: new Date(), distanceKm: null,
  };
  const points = [
    { latitude: 0, longitude: 0, timestamp: trip.startTime, speed: null },
    { latitude: 0, longitude: 0.001, timestamp: trip.endTime, speed: null },
  ];
  const fixture = createVehicleUseCases([trip], points);

  const first = await fixture.useCases.get(fixture.userId, fixture.vehicleId);
  assert.equal(fixture.positionReads, 1);
  assert.equal(fixture.distanceWrites, 1);
  assert.ok(trip.distanceKm != null && trip.distanceKm > 0);

  const second = await fixture.useCases.get(fixture.userId, fixture.vehicleId);
  assert.equal(fixture.positionReads, 1);
  assert.equal(fixture.distanceWrites, 1);
  assert.equal(fixture.storedTripReads, 2);
  assert.equal(second.vehicle.estimatedOdometerKm, first.vehicle.estimatedOdometerKm);
});

test('a trip that started before the odometer base is measured but not cached', async () => {
  const baseAt = new Date(Date.now() - 60 * 60 * 1000);
  const trip: StoredVehicleTrip = {
    id: 'trip-partial', source: 'device', deviceId: 'device-1',
    startTime: new Date(baseAt.getTime() - 60_000), endTime: new Date(), distanceKm: null,
  };
  const points = [
    { latitude: 0, longitude: 0, timestamp: baseAt, speed: null },
    { latitude: 0, longitude: 0.001, timestamp: trip.endTime, speed: null },
  ];
  const fixture = createVehicleUseCases([trip], points);

  await fixture.useCases.get(fixture.userId, fixture.vehicleId);

  assert.equal(fixture.positionReads, 1);
  assert.equal(fixture.distanceWrites, 0);
  assert.equal(trip.distanceKm, null);
});

test('editing a trip time resets its stored distance', async () => {
  const userId = 'user-1';
  const tripId = 'trip-1';
  const startTime = new Date('2026-01-01T10:00:00Z');
  const row = {
    id: tripId, userId, deviceId: null, device: null, vehicleId: null, vehicle: null,
    startTime, endTime: new Date('2026-01-01T11:00:00Z'), name: null, favorite: false,
    source: 'imported', createdAt: startTime, distanceKm: 25,
  };
  let updateArgs: unknown;
  const prisma = {
    trip: {
      findFirst: async () => row,
      findFirstOrThrow: async () => row,
      updateMany: async (args: unknown) => { updateArgs = args; },
    },
  } as unknown as PrismaClient;
  const repository = new PrismaTripRepository(prisma);
  const ownership = new OwnershipPolicy({ findOwnerId: async () => userId });
  const useCases = new TripUseCases(repository, ownership);

  await useCases.update(userId, tripId, { startTime: new Date('2026-01-01T10:05:00Z') });

  assert.deepEqual(updateArgs, {
    where: { id: tripId, userId },
    data: { startTime: new Date('2026-01-01T10:05:00Z'), distanceKm: null },
  });
});
