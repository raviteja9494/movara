import { AppError } from './AppError';

/**
 * Not found error - 404 Not Found
 * Raised when requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} with identifier "${identifier}" not found`
      : `${resource} not found`;

    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';

    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
