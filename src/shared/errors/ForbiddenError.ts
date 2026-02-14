import { AppError } from './AppError';

/**
 * Forbidden error - 403 Forbidden
 * Raised when user lacks permission to access resource
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';

    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}
