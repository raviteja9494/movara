import { z } from 'zod';

/**
 * Shared validation schemas using Zod
 * Decoupled from controllers for reusability
 */

// ============= Vehicles Schemas =============

export const CreateVehicleSchema = z.object({
  name: z
    .string('name must be a string')
    .min(1, 'name is required and must not be empty')
    .max(255, 'name must not exceed 255 characters'),
  description: z
    .string()
    .max(1000, 'description must not exceed 1000 characters')
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
});

export type CreateVehicleRequest = z.infer<typeof CreateVehicleSchema>;

// ============= Devices Schemas =============

export const UpdateDeviceSchema = z.object({
  name: z
    .string()
    .max(255, 'name must not exceed 255 characters')
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
});

export type UpdateDeviceRequest = z.infer<typeof UpdateDeviceSchema>;

// ============= Maintenance Schemas =============

const MaintenanceTypeEnum = z.enum([
  'service',
  'fuel',
  'repair',
  'inspection',
  'other',
]);

export const CreateMaintenanceSchema = z.object({
  vehicleId: z
    .string('vehicleId must be a string')
    .uuid('vehicleId must be a valid UUID'),
  type: MaintenanceTypeEnum,
  date: z
    .string('date must be a string')
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'date must be a valid ISO 8601 datetime'),
  notes: z
    .string()
    .max(1000, 'notes must not exceed 1000 characters')
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  odometer: z
    .number('odometer must be a number')
    .int('odometer must be an integer')
    .positive('odometer must be a positive number')
    .optional()
    .nullable(),
});

export type CreateMaintenanceRequest = z.infer<typeof CreateMaintenanceSchema>;

// ============= Query Schemas =============

export const GetPositionsQuerySchema = z.object({
  deviceId: z
    .string('deviceId must be a string')
    .uuid('deviceId must be a valid UUID'),
  limit: z
    .number('limit must be a number')
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(100, 'limit must not exceed 100')
    .optional()
    .default(10),
});

export type GetPositionsQuery = z.infer<typeof GetPositionsQuerySchema>;

// ============= System Schemas =============

export const CreateBackupSchema = z.object({
  backupDir: z
    .string()
    .default('./backups'),
});

export type CreateBackupRequest = z.infer<typeof CreateBackupSchema>;

export const RestoreBackupSchema = z.object({
  backupPath: z
    .string('backupPath must be a string')
    .min(1, 'backupPath is required'),
});

export type RestoreBackupRequest = z.infer<typeof RestoreBackupSchema>;

// ============= Pagination Schemas =============
// Query params from HTTP are always strings; coerce to number for validation
export const PaginationQuerySchema = z.object({
  page: z
    .coerce
    .number('page must be a number')
    .int('page must be an integer')
    .min(1, 'page must be at least 1')
    .optional()
    .default(1),
  limit: z
    .coerce
    .number('limit must be a number')
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(100, 'limit must not exceed 100')
    .optional()
    .default(10),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
