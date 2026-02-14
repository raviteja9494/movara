/**
 * Base application error class
 * All domain and application errors extend this
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;

    // Maintain proper stack trace for where our error was thrown
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      error: true,
      message: this.message,
      code: this.code,
    };
  }
}
