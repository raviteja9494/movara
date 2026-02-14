import { z } from 'zod';
import { ValidationError } from '../errors';

/**
 * Validate data against a Zod schema
 * Throws ValidationError on failure
 *
 * @param data Data to validate
 * @param schema Zod schema
 * @returns Validated data
 */
export function validate<T>(data: unknown, schema: z.ZodSchema<T>): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(result.error.errors);
  }

  return result.data;
}

/**
 * Safely validate data and return result or error
 * Does not throw; suitable for error handling
 *
 * @param data Data to validate
 * @param schema Zod schema
 * @returns { success: true, data } or { success: false, error }
 */
export function validateSafe<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
): { success: true; data: T } | { success: false; error: ValidationError } {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: new ValidationError(result.error.errors),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
