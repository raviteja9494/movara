/**
 * Minimal health-only server (optional). The main application entry is main.ts.
 * Use this only if you need a separate process that only exposes /health (e.g. for a load balancer).
 */
import Fastify from 'fastify';

const app = Fastify({
  logger: process.env.NODE_ENV === 'development',
});

app.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = '0.0.0.0';
    
    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
