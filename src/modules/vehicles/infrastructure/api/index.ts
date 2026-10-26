import type { FastifyInstance } from 'fastify';
import type { FuelRecordUseCases, VehicleSummaryUseCases, VehicleTravelUseCases, VehicleUseCases } from '../../application/use-cases';
import { registerFuelRecordRoutes } from './fuel-records';
import { registerVehicleTravelRoutes } from './travel';
import { registerVehicleCrudRoutes } from './vehicles';

export interface VehicleRouteDependencies {
  vehicleUseCases: VehicleUseCases;
  vehicleSummaryUseCases: VehicleSummaryUseCases;
  fuelRecordUseCases: FuelRecordUseCases;
  vehicleTravelUseCases: VehicleTravelUseCases;
}

export async function registerVehicleRoutes(app: FastifyInstance, dependencies: VehicleRouteDependencies) {
  await registerVehicleCrudRoutes(app, dependencies.vehicleUseCases, dependencies.vehicleSummaryUseCases);
  await registerFuelRecordRoutes(app, dependencies.fuelRecordUseCases);
  await registerVehicleTravelRoutes(app, dependencies.vehicleTravelUseCases);
}
