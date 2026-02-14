import { AppError } from './AppError';

/**
 * Conflict error - 409 Conflict
 * Raised when resource already exists or state conflicts
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';

    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}
