import type { Device } from '../api/devices';
import type { FuelRecord, VehicleSummaryReminderItem } from '../api/vehicles';
import type { VehicleRecord, VehicleRecordSubtype, VehicleRecordType } from '../api/vehicleRecords';
import { formatDistance } from './units';

export type VehicleSection = 'overview' | 'fuel' | 'records' | 'trips';
export type TimeFilterPreset = 'all' | 'this_month' | 'last_30_days' | 'this_year' | 'custom';
export type RecordScope = 'all' | 'document';

export interface ReminderItem {
  id: string;
  title: string;
  detail: string;
  severity: 'overdue' | 'due' | 'info';
  section: VehicleSection;
}

export const RECORD_SUBTYPE_OPTIONS: { value: VehicleRecordSubtype; label: string; type: VehicleRecordType }[] = [
  { value: 'service', label: 'Service', type: 'maintenance' },
  { value: 'repair', label: 'Repair', type: 'maintenance' },
  { value: 'inspection', label: 'Inspection', type: 'maintenance' },
  { value: 'other', label: 'Other maintenance', type: 'maintenance' },
  { value: 'pollution_check', label: 'Pollution check', type: 'document' },
  { value: 'registration', label: 'Registration', type: 'document' },
  { value: 'permit', label: 'Permit', type: 'document' },
  { value: 'warranty', label: 'Warranty', type: 'document' },
  { value: 'custom', label: 'Custom document', type: 'document' },
  { value: 'sim_recharge', label: 'SIM recharge', type: 'subscription' },
  { value: 'custom', label: 'Custom subscription', type: 'subscription' },
  { value: 'custom', label: 'General expense', type: 'expense' },
  { value: 'tracker_purchase', label: 'Tracker purchase', type: 'accessory' },
  { value: 'accessory_purchase', label: 'Accessory purchase', type: 'accessory' },
];

const MAINTENANCE_SUBTYPES = new Set<VehicleRecordSubtype>(['service', 'repair', 'inspection', 'other']);

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatEstimatedDelta(
  currentKm: number | null,
  estimatedKm: number | null,
  distanceUnit: 'km' | 'mi',
): string | null {
  if (currentKm == null || estimatedKm == null) return null;
  const diff = estimatedKm - currentKm;
  if (Math.abs(diff) < 0.05) return 'Aligned with manual reading';
  const distance = formatDistance(Math.abs(diff), distanceUnit);
  return diff > 0 ? `${distance} above manual` : `${distance} below manual`;
}

export function trackerOdometerKm(device: Device | null | undefined): number | null {
  if (!device) return null;
  const attrs = device.lastAttributes ?? {};
  const totalMileage = attrs.gt06_total_mileage_km;
  if (typeof totalMileage === 'number' && Number.isFinite(totalMileage)) {
    return totalMileage;
  }
  const rawMileage = attrs.gt06_mileage_raw;
  if (typeof rawMileage === 'number' && Number.isFinite(rawMileage)) {
    return rawMileage / 1000;
  }
  const genericOdometer = attrs.odometer;
  if (typeof genericOdometer === 'number' && Number.isFinite(genericOdometer)) {
    return genericOdometer;
  }
  return null;
}

export function trackerOdometerSource(device: Device | null | undefined): string | null {
  if (!device) return null;
  const attrs = device.lastAttributes ?? {};
  if (typeof attrs.gt06_total_mileage_km === 'number') return 'Tracker mileage command';
  if (typeof attrs.gt06_mileage_raw === 'number') return 'GT06 GPS packets';
  if (typeof attrs.odometer === 'number') return 'Tracker telemetry';
  return null;
}

export function formatOdometerDelta(
  baseKm: number | null,
  compareKm: number | null,
  distanceUnit: 'km' | 'mi',
  compareLabel: string,
): string | null {
  if (baseKm == null || compareKm == null) return null;
  const diff = compareKm - baseKm;
  if (Math.abs(diff) < 0.05) return `${compareLabel} aligned`;
  const distance = formatDistance(Math.abs(diff), distanceUnit);
  return diff > 0 ? `${compareLabel} ${distance} above` : `${compareLabel} ${distance} below`;
}

export function formatChartDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

export function deviceLabel(d: Device): string {
  return d.name?.trim() || d.imei;
}

export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

export function dateQueryValue(timestamp: number | null): string | undefined {
  if (timestamp == null) return undefined;
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getPresetDateRange(
  preset: TimeFilterPreset,
  fromDate: string,
  toDate: string,
): { fromMs: number | null; toMs: number | null } {
  const now = new Date();
  if (preset === 'all') return { fromMs: null, toMs: null };
  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { fromMs: from.getTime(), toMs: endOfDay(now).getTime() };
  }
  if (preset === 'last_30_days') {
    const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { fromMs: startOfDay(from).getTime(), toMs: endOfDay(now).getTime() };
  }
  if (preset === 'this_year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { fromMs: from.getTime(), toMs: endOfDay(now).getTime() };
  }
  const fromMs = fromDate ? startOfDay(new Date(fromDate)).getTime() : null;
  const toMs = toDate ? endOfDay(new Date(toDate)).getTime() : null;
  return {
    fromMs: Number.isNaN(fromMs ?? NaN) ? null : fromMs,
    toMs: Number.isNaN(toMs ?? NaN) ? null : toMs,
  };
}

export function withinDateRange(iso: string, range: { fromMs: number | null; toMs: number | null }): boolean {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return false;
  if (range.fromMs != null && at < range.fromMs) return false;
  if (range.toMs != null && at > range.toMs) return false;
  return true;
}

export function maintenanceTypeFromRecord(record: VehicleRecord): string {
  return record.subtype && MAINTENANCE_SUBTYPES.has(record.subtype) ? record.subtype : 'other';
}

export function recordSubtypeLabel(subtype: string | null): string {
  if (!subtype) return 'Record';
  const found = RECORD_SUBTYPE_OPTIONS.find((option) => option.value === subtype);
  if (found) return found.label;
  return subtype.replace(/_/g, ' ');
}

export function getVehicleSection(value: string | null): VehicleSection {
  if (value === 'maintenance' || value === 'documents') {
    return 'records';
  }
  if (value === 'fuel' || value === 'records' || value === 'trips') {
    return value;
  }
  return 'overview';
}

export function formatReminderDays(days: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  return `due in ${days} day${days === 1 ? '' : 's'}`;
}

export function formatDueLabel(item: VehicleSummaryReminderItem, distanceUnit: 'km' | 'mi'): string {
  if (item.remainingDays != null) {
    if (item.remainingDays < 0) return `${Math.abs(item.remainingDays)}d overdue`;
    return item.remainingDays === 0 ? 'Due today' : `Due in ${item.remainingDays}d`;
  }
  if (item.remainingKm != null) {
    return item.remainingKm <= 0
      ? `${formatDistance(Math.abs(item.remainingKm), distanceUnit)} overdue`
      : `Due in ${formatDistance(item.remainingKm, distanceUnit)}`;
  }
  return '';
}

export function lastFillKmPerL(records: FuelRecord[]): number | null {
  if (records.length < 2) return null;
  const sorted = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const curr = sorted[0];
  const prev = sorted[1];
  const dist = curr.odometer - prev.odometer;
  if (dist <= 0 || curr.fuelQuantity <= 0) return null;
  const kmPerL = dist / curr.fuelQuantity;
  return Number.isFinite(kmPerL) && kmPerL > 0 ? kmPerL : null;
}
