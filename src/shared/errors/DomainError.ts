import { AppError } from './AppError';

/**
 * Domain error - 422 Unprocessable Entity
 * Raised when domain business logic validation fails
 */
export class DomainError extends AppError {
  constructor(message: string) {
    super(message, 422, 'DOMAIN_ERROR');
    this.name = 'DomainError';

    Object.setPrototypeOf(this, DomainError.prototype);
  }
}
