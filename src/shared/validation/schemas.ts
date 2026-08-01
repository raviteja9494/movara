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

const optionalDateSchema = z
  .string()
  .optional()
  .nullable()
  .transform((s) => (s && s.trim() && !Number.isNaN(new Date(s).getTime()) ? new Date(s) : null));

export type CreateVehicleRequest = z.infer<typeof CreateVehicleSchema>;

export const UpdateVehicleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable().transform((v) => (v === '' ? null : v)),
  licensePlate: z.string().max(32).optional().nullable().transform((v) => (v === '' ? null : v)),
  vin: z.string().max(17).optional().nullable().transform((v) => (v === '' ? null : v)),
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  make: z.string().max(100).optional().nullable().transform((v) => (v === '' ? null : v)),
  model: z.string().max(100).optional().nullable().transform((v) => (v === '' ? null : v)),
  currentOdometer: z.coerce.number().int().min(0).optional().nullable(),
  fuelType: z.string().max(50).optional().nullable().transform((v) => (v === '' ? null : v)),
  icon: z.string().max(32).optional().nullable().transform((v) => (v === '' ? null : v)),
  deviceId: z.string().uuid().optional().nullable().transform((v) => (v === '' ? null : v)),
  thirdPartyInsuranceStart: optionalDateSchema,
  thirdPartyInsuranceEnd: optionalDateSchema,
  thirdPartyInsuranceProvider: z.string().max(255).optional().nullable().transform((v) => (v === '' ? null : v)),
  thirdPartyInsuranceNumber: z.string().max(64).optional().nullable().transform((v) => (v === '' ? null : v)),
  ownInsuranceStart: optionalDateSchema,
  ownInsuranceEnd: optionalDateSchema,
  ownInsuranceProvider: z.string().max(255).optional().nullable().transform((v) => (v === '' ? null : v)),
  ownInsuranceNumber: z.string().max(64).optional().nullable().transform((v) => (v === '' ? null : v)),
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

export const UpdateFuelRecordSchema = z.object({
  date: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid date required')
    .transform((s) => new Date(s))
    .optional(),
  odometer: z.coerce.number().int().min(0).optional(),
  fuelQuantity: z.coerce.number().positive('quantity must be positive').optional(),
  fuelCost: z.coerce.number().min(0).optional().nullable(),
  fuelRate: z.coerce.number().min(0).optional().nullable(),
});

export type UpdateFuelRecordRequest = z.infer<typeof UpdateFuelRecordSchema>;

export const CreateTripMergeSchema = z.object({
  gapAfter: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid gapAfter date required'),
  gapBefore: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid gapBefore date required'),
});

export type CreateTripMergeRequest = z.infer<typeof CreateTripMergeSchema>;

// ============= Trips (manual) Schemas =============

export const CreateTripSchema = z.object({
  deviceId: z.string().uuid('deviceId must be a valid UUID'),
  startTime: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid startTime required'),
  endTime: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid endTime required'),
  vehicleId: z.string().uuid().optional().nullable().transform((v) => (v === '' ? null : v)),
  name: z.string().max(255).optional().nullable().transform((v) => (v === '' ? null : v)),
  favorite: z.boolean().optional(),
});

export type CreateTripRequest = z.infer<typeof CreateTripSchema>;

export const ListTripsQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  favorite: z.enum(['true', 'false']).optional(),
  from: z.string().refine((s) => !Number.isNaN(new Date(s).getTime())).optional(),
  to: z.string().refine((s) => !Number.isNaN(new Date(s).getTime())).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export type ListTripsQuery = z.infer<typeof ListTripsQuerySchema>;

export const UpdateTripSchema = z.object({
  name: z.string().max(255).optional().nullable().transform((v) => (v === '' ? null : v)),
  favorite: z.boolean().optional(),
  startTime: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid startTime required')
    .optional(),
  endTime: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid endTime required')
    .optional(),
});

export type UpdateTripRequest = z.infer<typeof UpdateTripSchema>;

export const SplitTripSchema = z.object({
  splitAt: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid splitAt required'),
});

export type SplitTripRequest = z.infer<typeof SplitTripSchema>;

export const MergeTripsSchema = z.object({
  targetTripId: z.string().uuid('targetTripId must be a valid UUID'),
});

export type MergeTripsRequest = z.infer<typeof MergeTripsSchema>;

export const FuseTripsSchema = z.object({
  targetTripId: z.string().uuid('targetTripId must be a valid UUID'),
  primaryTripId: z.string().uuid('primaryTripId must be a valid UUID').optional(),
  gapThresholdMinutes: z.coerce.number().int().min(1).max(120).optional().default(5),
  name: z.string().max(255).optional().nullable().transform((v) => (v === '' ? null : v)),
});

export type FuseTripsRequest = z.infer<typeof FuseTripsSchema>;

export const CreateTripStopSchema = z.object({
  label: z.string().min(1, 'label is required').max(255),
  startTime: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid startTime required'),
  endTime: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid endTime required').optional(),
  latitude: z.coerce.number().finite(),
  longitude: z.coerce.number().finite(),
});

export type CreateTripStopRequest = z.infer<typeof CreateTripStopSchema>;

export const UpdateTripStopSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  endTime: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), 'valid endTime required').optional().nullable(),
});

export type UpdateTripStopRequest = z.infer<typeof UpdateTripStopSchema>;

// ============= Devices Schemas =============

export const UpdateDeviceSchema = z.object({
  name: z
    .string()
    .max(255, 'name must not exceed 255 characters')
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  osmandSecret: z.string().min(16, 'osmandSecret must be at least 16 characters').max(256).optional().nullable(),
});

export type UpdateDeviceRequest = z.infer<typeof UpdateDeviceSchema>;

export const SendDeviceCommandSchema = z.object({
  commandKey: z.string().min(1, 'commandKey is required'),
  values: z.record(z.string()).optional().default({}),
});

export type SendDeviceCommandRequest = z.infer<typeof SendDeviceCommandSchema>;

// ============= Locations Schemas =============

export const CreateSavedLocationSchema = z.object({
  name: z.string().min(1, 'name is required').max(255, 'name must not exceed 255 characters'),
  latitude: z.coerce.number().min(-90, 'latitude must be >= -90').max(90, 'latitude must be <= 90'),
  longitude: z.coerce.number().min(-180, 'longitude must be >= -180').max(180, 'longitude must be <= 180'),
  notes: z.string().max(1000, 'notes must not exceed 1000 characters').optional().nullable().transform((v) => (v === '' ? null : v)),
});

export type CreateSavedLocationRequest = z.infer<typeof CreateSavedLocationSchema>;

export const UpdateSavedLocationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  notes: z.string().max(1000).optional().nullable().transform((v) => (v === '' ? null : v)),
});

export type UpdateSavedLocationRequest = z.infer<typeof UpdateSavedLocationSchema>;

// ============= Maintenance Schemas =============

const MaintenanceTypeEnum = z.enum([
  'service',
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
  cost: z
    .number({ message: 'cost must be a number' })
    .min(0, 'cost must be non-negative')
    .optional()
    .nullable(),
});

export type CreateMaintenanceRequest = z.infer<typeof CreateMaintenanceSchema>;

export const UpdateMaintenanceSchema = z.object({
  type: MaintenanceTypeEnum.optional(),
  date: z
    .string({ message: 'date must be a string' })
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'date must be a valid ISO 8601 datetime')
    .optional(),
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
  cost: z
    .number({ message: 'cost must be a number' })
    .min(0, 'cost must be non-negative')
    .optional()
    .nullable(),
});

export type UpdateMaintenanceRequest = z.infer<typeof UpdateMaintenanceSchema>;

// ============= Vehicle Record Schemas =============

const VehicleRecordTypeEnum = z.enum([
  'maintenance',
  'document',
  'subscription',
  'expense',
  'accessory',
]);

const VehicleRecordSubtypeEnum = z.enum([
  'service',
  'repair',
  'inspection',
  'other',
  'insurance_third_party',
  'insurance_own_damage',
  'pollution_check',
  'registration',
  'sim_recharge',
  'tracker_purchase',
  'accessory_purchase',
  'permit',
  'warranty',
  'custom',
]);

const VehicleRecordReminderModeEnum = z.enum([
  'none',
  'on_date',
  'recurring_date',
  'recurring_odometer',
]);

const nullableDateStringSchema = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'date must be a valid ISO 8601 datetime')
  .optional()
  .nullable();

export const CreateVehicleRecordSchema = z.object({
  vehicleId: z.string().uuid('vehicleId must be a valid UUID'),
  type: VehicleRecordTypeEnum,
  subtype: VehicleRecordSubtypeEnum.optional().nullable(),
  title: z.string().min(1, 'title is required').max(255),
  notes: z.string().max(1000).optional().nullable().transform((v) => (v === '' ? null : v)),
  amount: z.coerce.number().min(0).optional().nullable(),
  odometer: z.coerce.number().int().min(0).optional().nullable(),
  date: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'date must be a valid ISO 8601 datetime'),
  validFrom: nullableDateStringSchema,
  validUntil: nullableDateStringSchema,
  provider: z.string().max(255).optional().nullable().transform((v) => (v === '' ? null : v)),
  referenceNumber: z.string().max(100).optional().nullable().transform((v) => (v === '' ? null : v)),
  reminderMode: VehicleRecordReminderModeEnum.optional().default('none'),
  reminderDaysBefore: z.coerce.number().int().min(0).max(365).optional().nullable(),
  recurringIntervalDays: z.coerce.number().int().min(1).optional().nullable(),
  recurringIntervalKm: z.coerce.number().int().min(1).optional().nullable(),
});

export const UpdateVehicleRecordSchema = z.object({
  type: VehicleRecordTypeEnum.optional(),
  subtype: VehicleRecordSubtypeEnum.optional().nullable(),
  title: z.string().min(1).max(255).optional(),
  notes: z.string().max(1000).optional().nullable().transform((v) => (v === '' ? null : v)),
  amount: z.coerce.number().min(0).optional().nullable(),
  odometer: z.coerce.number().int().min(0).optional().nullable(),
  date: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'date must be a valid ISO 8601 datetime')
    .optional(),
  validFrom: nullableDateStringSchema,
  validUntil: nullableDateStringSchema,
  provider: z.string().max(255).optional().nullable().transform((v) => (v === '' ? null : v)),
  referenceNumber: z.string().max(100).optional().nullable().transform((v) => (v === '' ? null : v)),
  reminderMode: VehicleRecordReminderModeEnum.optional(),
  reminderDaysBefore: z.coerce.number().int().min(0).max(365).optional().nullable(),
  recurringIntervalDays: z.coerce.number().int().min(1).optional().nullable(),
  recurringIntervalKm: z.coerce.number().int().min(1).optional().nullable(),
});

export const ListVehicleRecordsQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  type: VehicleRecordTypeEnum.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type CreateVehicleRecordRequest = z.infer<typeof CreateVehicleRecordSchema>;
export type UpdateVehicleRecordRequest = z.infer<typeof UpdateVehicleRecordSchema>;
export type ListVehicleRecordsQuery = z.infer<typeof ListVehicleRecordsQuerySchema>;

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

export const CreateBackupSchema = z.object({});

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
