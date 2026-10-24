import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VehicleUseCases } from '../src/modules/vehicles/application/use-cases';
import { Vehicle } from '../src/modules/vehicles/domain/entities';
import type { VehicleRepository, VehicleTravelRepository } from '../src/modules/vehicles/domain/repositories';
import { OwnershipPolicy } from '../src/shared/authorization';

test('odometer estimate refresh is throttled for five minutes', async () => {
  const userId = 'user-1';
  const vehicleId = 'vehicle-1';
  const baseAt = new Date(Date.now() - 60 * 60 * 1000);
  const latestEnd = new Date();
  let details = {
    vehicle: new Vehicle(vehicleId, userId, 'Car', null, baseAt, null, null, null, null, null, null, 100,
      100, baseAt, new Date(Date.now() - 10 * 60 * 1000)),
    insuranceRecords: [],
  };
  let findStoredTripsCalls = 0;
  const vehicles = {
    findVehicleDetailsById: async () => details,
  } as unknown as VehicleRepository;
  const travel = {
    findLatestStoredTripEnd: async () => latestEnd,
    findStoredTrips: async () => {
      findStoredTripsCalls += 1;
      return [];
    },
    updateEstimatedOdometer: async () => undefined,
  } as unknown as VehicleTravelRepository;
  const ownership = new OwnershipPolicy({
    findOwnerId: async () => userId,
  });
  const useCases = new VehicleUseCases(vehicles, travel, ownership);

  details = await useCases.get(userId, vehicleId);
  assert.equal(findStoredTripsCalls, 1);

  details = await useCases.get(userId, vehicleId);
  assert.equal(findStoredTripsCalls, 1);

  details = {
    ...details,
    vehicle: new Vehicle(
      details.vehicle.id, details.vehicle.userId, details.vehicle.name, details.vehicle.description,
      details.vehicle.createdAt, details.vehicle.licensePlate, details.vehicle.vin, details.vehicle.year,
      details.vehicle.make, details.vehicle.model, details.vehicle.currentOdometer,
      details.vehicle.estimatedOdometerKm, details.vehicle.estimatedOdometerBaseKm,
      details.vehicle.estimatedOdometerBaseAt, new Date(Date.now() - 6 * 60 * 1000),
      details.vehicle.fuelType, details.vehicle.icon, details.vehicle.photoPath, details.vehicle.deviceId,
    ),
  };
  await useCases.get(userId, vehicleId);
  assert.equal(findStoredTripsCalls, 2);
});
