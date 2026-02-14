import { z } from 'zod';

/**
 * Shared validation schemas using Zod
 * Decoupled from controllers for reusability
 */

// ============= Vehicles Schemas =============

export const CreateVehicleSchema = z.object({
  name: z
    .string()
    .min(1, 'name is required and must not be empty')
    .max(255, 'name must not exceed 255 characters'),
  description: z
    .string()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  licensePlate: z.string().max(32).optional().nullable().transform((v) => (v === '' ? null : v)),
  vin: z.string().max(17).optional().nullable().transform((v) => (v === '' ? null : v)),
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  make: z.string().max(100).optional().nullable().transform((v) => (v === '' ? null : v)),
  model: z.string().max(100).optional().nullable().transform((v) => (v === '' ? null : v)),
  currentOdometer: z.coerce.number().int().min(0).optional().nullable(),
  fuelType: z.string().max(50).optional().nullable().transform((v) => (v === '' ? null : v)),
  icon: z.string().max(32).optional().nullable().transform((v) => (v === '' ? null : v)),
  deviceId: z.string().uuid().optional().nullable().transform((v) => (v === '' ? null : v)),
});

export type CreateVehicleRequest = z.infer<typeof CreateVehicleSchema>;

export const UpdateVehicleSchema = z.object({
  deviceId: z.string().uuid().optional().nullable().transform((v) => (v === '' ? null : v)),
  icon: z.string().max(32).optional().nullable().transform((v) => (v === '' ? null : v)),
});

export type UpdateVehicleRequest = z.infer<typeof UpdateVehicleSchema>;

export const CreateFuelRecordSchema = z.object({
  date: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid date required')
    .transform((s) => new Date(s)),
  odometer: z.coerce.number().int().min(0),
  fuelQuantity: z.coerce.number().positive('quantity must be positive'),
  fuelCost: z.coerce.number().min(0).optional().nullable(),
  fuelRate: z.coerce.number().min(0).optional().nullable(),
});

export type CreateFuelRecordRequest = z.infer<typeof CreateFuelRecordSchema>;

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
    .string({ message: 'vehicleId must be a string' })
    .uuid('vehicleId must be a valid UUID'),
  type: MaintenanceTypeEnum,
  date: z
    .string({ message: 'date must be a string' })
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'date must be a valid ISO 8601 datetime'),
  notes: z
    .string()
    .max(1000, 'notes must not exceed 1000 characters')
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  odometer: z
    .number({ message: 'odometer must be a number' })
    .int('odometer must be an integer')
    .positive('odometer must be a positive number')
    .optional()
    .nullable(),
});

export type CreateMaintenanceRequest = z.infer<typeof CreateMaintenanceSchema>;

// ============= Query Schemas =============

export const GetPositionsQuerySchema = z.object({
  deviceId: z
    .string({ message: 'deviceId must be a string' })
    .uuid('deviceId must be a valid UUID'),
  limit: z
    .coerce
    .number()
    .int()
    .min(1, 'limit must be at least 1')
    .max(500, 'limit must not exceed 500')
    .optional()
    .default(100),
  from: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'from must be valid ISO 8601')
    .optional()
    .transform((s) => (s != null ? new Date(s) : undefined)),
  to: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'to must be valid ISO 8601')
    .optional()
    .transform((s) => (s != null ? new Date(s) : undefined)),
});

export type GetPositionsQuery = z.infer<typeof GetPositionsQuerySchema>;

export const GetPositionStatsQuerySchema = z.object({
  deviceId: z.string().uuid('deviceId must be a valid UUID'),
  from: z
    .string({ message: 'from is required' })
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'from must be valid ISO 8601')
    .transform((s) => new Date(s)),
  to: z
    .string({ message: 'to is required' })
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'to must be valid ISO 8601')
    .transform((s) => new Date(s)),
});

export type GetPositionStatsQuery = z.infer<typeof GetPositionStatsQuerySchema>;

// ============= System Schemas =============

export const CreateBackupSchema = z.object({
  backupDir: z
    .string()
    .default('./backups'),
});

export type CreateBackupRequest = z.infer<typeof CreateBackupSchema>;

export const RestoreBackupSchema = z.object({
  backupPath: z
    .string({ message: 'backupPath must be a string' })
    .min(1, 'backupPath is required'),
});

export type RestoreBackupRequest = z.infer<typeof RestoreBackupSchema>;

// ============= Auth Schemas =============

export const AuthLoginSchema = z.object({
  email: z.string().email('valid email required').toLowerCase().trim(),
  password: z.string().min(1, 'password is required'),
});

export const AuthRegisterSchema = z.object({
  email: z.string().email('valid email required').toLowerCase().trim(),
  password: z.string().min(8, 'password must be at least 8 characters'),
});

export type AuthLoginRequest = z.infer<typeof AuthLoginSchema>;
export type AuthRegisterRequest = z.infer<typeof AuthRegisterSchema>;

// ============= Pagination Schemas =============
// Query params from HTTP are always strings; coerce to number for validation
export const PaginationQuerySchema = z.object({
  page: z
    .coerce
    .number({ message: 'page must be a number' })
    .int('page must be an integer')
    .min(1, 'page must be at least 1')
    .optional()
    .default(1),
  limit: z
    .coerce
    .number({ message: 'limit must be a number' })
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(100, 'limit must not exceed 100')
    .optional()
    .default(10),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
