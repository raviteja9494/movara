import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { initializeErrorHandling } from './app';
import { appFileLogger } from './shared/appLogging/AppFileLogger';
import { runtimeSettingsStore } from './shared/runtimeSettings/RuntimeSettingsStore';
import { createCompositionRoot } from './composition-root';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const compositionRoot = createCompositionRoot();
let app: FastifyInstance | null = null;

const start = async () => {
  try {
    await compositionRoot.initialize();
    const runtimeSettings = runtimeSettingsStore.get();
    const server = Fastify({
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
    app = server;

    await server.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
        },
      },
      xContentTypeOptions: true,
      xPoweredBy: false,
    });
    await server.register(rateLimit, {
      max: 300,
      timeWindow: '1 minute',
    });
    server.get('/health', async () => ({ status: 'ok' }));
    await server.register(cors, { origin: true });
    await server.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100 MB (for DB restore uploads)
    await initializeErrorHandling(server);
    await compositionRoot.registerRoutes(server);

    await server.listen({ port: PORT, host: HOST });
    server.log.info(`Server listening at http://${HOST}:${PORT}`);
  } catch (err) {
    app?.log.error(err);
    await compositionRoot.disconnect();
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  app?.log.info(`${signal} received, shutting down`);
  await app?.close();
  await compositionRoot.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

start();
