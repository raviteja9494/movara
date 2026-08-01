import type { VehicleRecord } from '../../domain/entities';

const MAINTENANCE_SUBTYPES = new Set(['service', 'repair', 'inspection', 'other']);

export function toVehicleRecordDto(record: VehicleRecord) {
  return {
    id: record.id, vehicleId: record.vehicleId, vehicleName: record.vehicleName, type: record.type,
    subtype: record.subtype, title: record.title, notes: record.notes, amount: record.amount,
    odometer: record.odometer, date: record.date, validFrom: record.validFrom, validUntil: record.validUntil,
    provider: record.provider, referenceNumber: record.referenceNumber, reminderMode: record.reminderMode,
    reminderDaysBefore: record.reminderDaysBefore, recurringIntervalDays: record.recurringIntervalDays,
    recurringIntervalKm: record.recurringIntervalKm, attachmentPath: record.attachmentPath,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}

export function toMaintenanceDto(record: VehicleRecord) {
  return {
    id: record.id, vehicleId: record.vehicleId, vehicleName: record.vehicleName,
    type: record.subtype && MAINTENANCE_SUBTYPES.has(record.subtype) ? record.subtype : 'other',
    notes: record.notes, odometer: record.odometer, cost: record.amount, date: record.date,
    receiptPath: record.attachmentPath, createdAt: record.createdAt,
  };
}
