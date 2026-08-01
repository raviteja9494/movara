import type { FastifyInstance } from 'fastify';
import type { TripUseCases } from '../../application/use-cases';
import { registerTripEditingRoutes } from './editing';
import { registerTripFusionAndImportRoutes } from './fusion-import';
import { registerTripCrudRoutes } from './trips';

export async function registerTripRoutes(app: FastifyInstance, useCases: TripUseCases) {
  await registerTripCrudRoutes(app, useCases);
  await registerTripEditingRoutes(app, useCases);
  await registerTripFusionAndImportRoutes(app, useCases);
}
