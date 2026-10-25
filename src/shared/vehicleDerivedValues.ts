export interface FuelSummaryRecord {
  date: Date;
  odometer: number;
  fuelQuantity: number;
  fuelCost: number | null;
  fuelRate?: number | null;
}

export interface FuelSummary {
  averageKmPerL: number | null;
  recordCount: number;
  totalCost: number | null;
}

export function averageFuelEconomyKmPerL(records: FuelSummaryRecord[]): number | null {
  if (records.length < 2) return null;
  const sorted = [...records].sort((a, b) => a.date.getTime() - b.date.getTime());
  let totalDistance = 0;
  let totalLiters = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const distance = sorted[index].odometer - sorted[index - 1].odometer;
    if (distance > 0 && sorted[index].fuelQuantity > 0) {
      totalDistance += distance;
      totalLiters += sorted[index].fuelQuantity;
    }
  }
  if (totalDistance <= 0) return null;
  const average = totalDistance / totalLiters;
  return Number.isFinite(average) && average > 0 ? average : null;
}

export function summarizeFuelRecords(records: FuelSummaryRecord[]): FuelSummary {
  return {
    averageKmPerL: averageFuelEconomyKmPerL(records),
    recordCount: records.length,
    totalCost: records.length ? records.reduce((total, record) => total + (record.fuelCost ?? 0), 0) : null,
  };
}

export interface ReminderRecordForCalculation {
  id: string;
  title: string;
  type: string;
  subtype: string | null;
  date: Date;
  validUntil: Date | null;
  reminderMode: string;
  reminderDaysBefore: number | null;
  recurringIntervalDays: number | null;
  odometer: number | null;
  recurringIntervalKm: number | null;
}

export type ReminderSeverity = 'overdue' | 'due' | 'upcoming';

export interface CalculatedReminder {
  record: ReminderRecordForCalculation;
  kind: 'date' | 'odometer';
  severity: ReminderSeverity;
  dueDate: Date | null;
  dueOdometerKm: number | null;
  remainingDays: number | null;
  remainingKm: number | null;
  currentOdometerKm: number | null;
}

export function calculateRecordReminder(
  record: ReminderRecordForCalculation,
  odometerKm: number | null,
  now: Date,
): CalculatedReminder | null {
  if (record.reminderMode === 'on_date') {
    return calculateDateReminder(record, record.validUntil ?? record.date, now);
  }
  if (record.reminderMode === 'recurring_date' && record.recurringIntervalDays != null) {
    const dueDate = new Date(record.date.getTime() + record.recurringIntervalDays * 24 * 60 * 60 * 1000);
    return calculateDateReminder(record, dueDate, now);
  }
  if (record.reminderMode !== 'recurring_odometer' || odometerKm == null || record.odometer == null || record.recurringIntervalKm == null) {
    return null;
  }
  const dueOdometerKm = record.odometer + record.recurringIntervalKm;
  const remainingKm = dueOdometerKm - odometerKm;
  const warningKm = Math.min(1000, Math.max(250, Math.round(record.recurringIntervalKm * 0.1)));
  return {
    record,
    kind: 'odometer',
    severity: remainingKm <= 0 ? 'overdue' : remainingKm <= warningKm ? 'due' : 'upcoming',
    dueDate: null,
    dueOdometerKm,
    remainingDays: null,
    remainingKm,
    currentOdometerKm: odometerKm,
  };
}

function calculateDateReminder(
  record: ReminderRecordForCalculation,
  dueDate: Date,
  now: Date,
): CalculatedReminder {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const remainingDays = Math.round((startOfDay(dueDate) - startOfDay(now)) / 86400000);
  return {
    record,
    kind: 'date',
    severity: remainingDays < 0 ? 'overdue' : remainingDays <= (record.reminderDaysBefore ?? 30) ? 'due' : 'upcoming',
    dueDate,
    dueOdometerKm: null,
    remainingDays,
    remainingKm: null,
    currentOdometerKm: null,
  };
}

export function sortCalculatedReminders(items: CalculatedReminder[]): CalculatedReminder[] {
  const rank: Record<ReminderSeverity, number> = { overdue: 0, due: 1, upcoming: 2 };
  return [...items].sort((a, b) => rank[a.severity] - rank[b.severity]
    || (a.remainingDays ?? (a.remainingKm != null ? a.remainingKm / 100 : Number.MAX_SAFE_INTEGER))
      - (b.remainingDays ?? (b.remainingKm != null ? b.remainingKm / 100 : Number.MAX_SAFE_INTEGER))
    || a.record.title.localeCompare(b.record.title));
}
