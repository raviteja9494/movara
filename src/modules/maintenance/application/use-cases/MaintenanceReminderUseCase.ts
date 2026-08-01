import type { MaintenanceRepository } from '../../domain/repositories';
import type { VehicleRecord } from '../../domain/entities';
import type { OwnershipPolicy } from '../../../../shared/authorization';

const REMINDER_ITEM_LIMIT = 10;
type ReminderSeverity = 'overdue' | 'due' | 'upcoming';

export type VehicleReminderItem = {
  id: string; title: string; recordType: string; recordSubtype: string | null; mode: string;
  kind: 'date' | 'odometer'; severity: ReminderSeverity; detail: string; dueAt: string | null;
  daysRemaining: number | null; dueOdometerKm: number | null; remainingKm: number | null;
  currentOdometerKm: number | null;
};

export class MaintenanceReminderUseCase {
  constructor(private readonly records: MaintenanceRepository, private readonly ownership: OwnershipPolicy) {}

  async buildForVehicle(userId: string, vehicleId: string, odometerKm: number | null, now: Date) {
    await this.ownership.assertOwns(userId, 'vehicle', vehicleId);
    const records = await this.records.findReminderRecords(userId, vehicleId);
    const allItems = this.sort(records.map((record) => this.compute(record, odometerKm, now)).filter((item): item is VehicleReminderItem => item != null));
    const activeItems = allItems.filter((item) => item.severity === 'overdue' || item.severity === 'due');
    const overdueCount = activeItems.filter((item) => item.severity === 'overdue').length;
    const dueCount = activeItems.filter((item) => item.severity === 'due').length;
    const nextReminder = allItems[0] ?? null;
    const parts = [overdueCount ? `${overdueCount} overdue` : null, dueCount ? `${dueCount} due` : null].filter(Boolean);
    return {
      status: overdueCount ? 'overdue' : dueCount ? 'due' : records.length ? 'ok' : 'none',
      summary: parts.length ? parts.join(', ') : nextReminder ? `Next: ${nextReminder.title} (${nextReminder.detail})` : records.length ? 'No active reminders' : 'No reminders configured',
      configuredCount: records.length, dueCount, overdueCount, activeCount: activeItems.length,
      nextReminder, items: activeItems.slice(0, REMINDER_ITEM_LIMIT), currentOdometerKm: odometerKm,
      updatedAt: now.toISOString(),
    };
  }

  private compute(record: VehicleRecord, odometerKm: number | null, now: Date): VehicleReminderItem | null {
    if (record.reminderMode === 'on_date') return this.dateItem(record, record.validUntil ?? record.date, now);
    if (record.reminderMode === 'recurring_date' && record.recurringIntervalDays != null) {
      return this.dateItem(record, new Date(record.date.getTime() + record.recurringIntervalDays * 86400000), now);
    }
    if (record.reminderMode !== 'recurring_odometer' || odometerKm == null || record.odometer == null || record.recurringIntervalKm == null) return null;
    const dueOdometerKm = record.odometer + record.recurringIntervalKm;
    const remainingKm = dueOdometerKm - odometerKm;
    const warnKm = Math.min(1000, Math.max(250, Math.round(record.recurringIntervalKm * 0.1)));
    const severity: ReminderSeverity = remainingKm <= 0 ? 'overdue' : remainingKm <= warnKm ? 'due' : 'upcoming';
    return this.base(record, 'odometer', severity, remainingKm <= 0 ? `${this.km(Math.abs(remainingKm))} overdue` : `Due in ${this.km(remainingKm)}`, {
      dueAt: null, daysRemaining: null, dueOdometerKm, remainingKm, currentOdometerKm: odometerKm,
    });
  }

  private dateItem(record: VehicleRecord, dueAt: Date, now: Date): VehicleReminderItem {
    const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysRemaining = Math.round((day(dueAt) - day(now)) / 86400000);
    const severity: ReminderSeverity = daysRemaining < 0 ? 'overdue' : daysRemaining <= (record.reminderDaysBefore ?? 30) ? 'due' : 'upcoming';
    const detail = daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : daysRemaining === 0 ? 'Due today' : `Due in ${daysRemaining}d`;
    return this.base(record, 'date', severity, detail, {
      dueAt: dueAt.toISOString(), daysRemaining, dueOdometerKm: null, remainingKm: null, currentOdometerKm: null,
    });
  }

  private base(record: VehicleRecord, kind: 'date' | 'odometer', severity: ReminderSeverity, detail: string, due: Pick<VehicleReminderItem, 'dueAt' | 'daysRemaining' | 'dueOdometerKm' | 'remainingKm' | 'currentOdometerKm'>): VehicleReminderItem {
    return { id: record.id, title: record.title, recordType: record.type, recordSubtype: record.subtype, mode: record.reminderMode, kind, severity, detail, ...due };
  }

  private km(value: number) { return `${Math.round(value * 10) / 10} km`; }

  private sort(items: VehicleReminderItem[]) {
    const rank: Record<ReminderSeverity, number> = { overdue: 0, due: 1, upcoming: 2 };
    return [...items].sort((a, b) => rank[a.severity] - rank[b.severity]
      || (a.daysRemaining ?? (a.remainingKm != null ? a.remainingKm / 100 : Number.MAX_SAFE_INTEGER))
        - (b.daysRemaining ?? (b.remainingKm != null ? b.remainingKm / 100 : Number.MAX_SAFE_INTEGER))
      || a.title.localeCompare(b.title));
  }
}
