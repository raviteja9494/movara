import Fastify from 'fastify';
import { registerTrackingRoutes } from './modules/tracking/infrastructure/api';
import { registerVehicleRoutes } from './modules/vehicles/infrastructure/api';
import { registerMaintenanceRoutes } from './modules/maintenance/infrastructure/api';
import { registerSystemRoutes } from './modules/system/infrastructure/api';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

const app = Fastify({
  logger: process.env.NODE_ENV === 'development',
});

app.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    // Register module routes
    await registerTrackingRoutes(app);
    await registerVehicleRoutes(app);
    await registerMaintenanceRoutes(app);
    await registerSystemRoutes(app);

    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening at http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
