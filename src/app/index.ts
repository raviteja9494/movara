import type { FastifyInstance } from 'fastify';
import { AppError } from '../shared/errors';

/**
 * Initialize Fastify error handling
 * Sets up global error handler for consistent error responses
 */
export async function initializeErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    const statusCode = typeof (error as { statusCode?: number }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';

    return reply.status(statusCode === 400 ? 400 : statusCode || 500).send({
      error: true,
      message: statusCode === 400 ? 'Request validation failed' : message,
      code: statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
    });
  });
}
