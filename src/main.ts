import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerAuthRoutes, registerAuthHook } from './modules/auth/infrastructure/api';
import { registerTrackingRoutes } from './modules/tracking/infrastructure/api';
import { registerVehicleRoutes } from './modules/vehicles/infrastructure/api';
import { registerMaintenanceRoutes } from './modules/maintenance/infrastructure/api';
import { registerSystemRoutes } from './modules/system/infrastructure/api';
import { initializeErrorHandling } from './app';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    prettyPrint: process.env.NODE_ENV === 'development',
  },
});

app.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await app.register(cors, { origin: true });
    await initializeErrorHandling(app);
    await registerAuthRoutes(app);
    registerAuthHook(app);
    await registerTrackingRoutes(app);
    await registerVehicleRoutes(app);
    await registerMaintenanceRoutes(app);
    await registerSystemRoutes(app);

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening at http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
