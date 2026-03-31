import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { registerAuthRoutes, registerAuthHook } from './modules/auth/infrastructure/api';
import { registerTrackingRoutes } from './modules/tracking/infrastructure/api';
import { registerVehicleRoutes } from './modules/vehicles/infrastructure/api';
import { registerTripRoutes } from './modules/trips/infrastructure/api';
import { registerMaintenanceRoutes } from './modules/maintenance/infrastructure/api';
import { registerSystemRoutes } from './modules/system/infrastructure/api';
import { initializeErrorHandling } from './app';
import { appFileLogger } from './shared/appLogging/AppFileLogger';
import { runtimeSettingsStore } from './shared/runtimeSettings/RuntimeSettingsStore';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const runtimeSettings = runtimeSettingsStore.get();

const app = Fastify({
  logger: {
    level: runtimeSettings.appLogLevel,
    hooks: {
      logMethod(args, method, level) {
        const label =
          level === 10 ? 'trace'
          : level === 20 ? 'debug'
          : level === 30 ? 'info'
          : level === 40 ? 'warn'
          : level === 50 ? 'error'
          : level === 60 ? 'fatal'
          : String(level);
        appFileLogger.log(label, args as unknown[]);
        return method.apply(this, args);
      },
    },
  },
}) as FastifyInstance;

app.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await app.register(cors, { origin: true });
    await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100 MB (for DB restore uploads)
    await initializeErrorHandling(app);
    await registerAuthRoutes(app);
    registerAuthHook(app);
    await registerTrackingRoutes(app);
    await registerVehicleRoutes(app);
    await registerTripRoutes(app);
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
