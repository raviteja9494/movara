import { FastifyInstance, FastifyError } from 'fastify';
import { AppError } from '../shared/errors';

/**
 * Initialize Fastify error handling
 * Sets up global error handler for consistent error responses
 */
export async function initializeErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    // Log error
    app.log.error(error);

    // Handle AppError and subclasses
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Handle Fastify validation errors
    if (error instanceof FastifyError && error.statusCode === 400) {
      return reply.status(400).send({
        error: true,
        message: 'Request validation failed',
        code: 'VALIDATION_ERROR',
      });
    }

    // Handle unexpected errors
    const statusCode = error instanceof FastifyError ? error.statusCode || 500 : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';

    return reply.status(statusCode).send({
      error: true,
      message,
      code: 'INTERNAL_ERROR',
    });
  });
}
