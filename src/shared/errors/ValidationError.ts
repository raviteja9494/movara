import { AppError } from './AppError';
import { z } from 'zod';

/**
 * Validation error - 400 Bad Request
 * Raised when request validation fails
 */
export class ValidationError extends AppError {
  public readonly errors: z.ZodError['errors'];

  constructor(errors: z.ZodError['errors']) {
    super('Validation failed', 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.errors = errors;

    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  getFieldErrors(): Record<string, string[]> {
    const fieldErrors: Record<string, string[]> = {};

    for (const error of this.errors) {
      const path = error.path.join('.');
      if (!fieldErrors[path]) {
        fieldErrors[path] = [];
      }
      fieldErrors[path].push(error.message);
    }

    return fieldErrors;
  }

  toJSON() {
    return {
      error: true,
      message: this.message,
      code: this.code,
      fields: this.getFieldErrors(),
    };
  }
}
