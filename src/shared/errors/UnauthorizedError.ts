import { AppError } from './AppError';

/**
 * Unauthorized error - 401 Unauthorized
 * Raised when authentication fails or is missing
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';

    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}
