import type { MaintenanceRepository } from '../../domain/repositories';
import type { OwnershipPolicy } from '../../../../shared/authorization';
import { calculateRecordReminder, sortCalculatedReminders } from '../../../../shared/vehicleDerivedValues';

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

  async buildForVehicle(userId: string, vehicleId: string, odometerKm: number | null, now: Date, itemLimit = REMINDER_ITEM_LIMIT) {
    await this.ownership.assertOwns(userId, 'vehicle', vehicleId);
    const records = await this.records.findReminderRecords(userId, vehicleId);
    const allItems = sortCalculatedReminders(
      records.map((record) => calculateRecordReminder(record, odometerKm, now))
        .filter((item): item is NonNullable<typeof item> => item != null),
    ).map((item) => this.toReminderItem(item));
    const activeItems = allItems.filter((item) => item.severity === 'overdue' || item.severity === 'due');
    const overdueCount = activeItems.filter((item) => item.severity === 'overdue').length;
    const dueCount = activeItems.filter((item) => item.severity === 'due').length;
    const nextReminder = allItems[0] ?? null;
    const parts = [overdueCount ? `${overdueCount} overdue` : null, dueCount ? `${dueCount} due` : null].filter(Boolean);
    return {
      status: overdueCount ? 'overdue' : dueCount ? 'due' : records.length ? 'ok' : 'none',
      summary: parts.length ? parts.join(', ') : nextReminder ? `Next: ${nextReminder.title} (${nextReminder.detail})` : records.length ? 'No active reminders' : 'No reminders configured',
      configuredCount: records.length, dueCount, overdueCount, activeCount: activeItems.length,
      nextReminder, items: activeItems.slice(0, itemLimit), currentOdometerKm: odometerKm,
      updatedAt: now.toISOString(),
    };
  }

  private toReminderItem(calculation: NonNullable<ReturnType<typeof calculateRecordReminder>>): VehicleReminderItem {
    const { record, kind, severity, dueDate, dueOdometerKm, remainingDays, remainingKm, currentOdometerKm } = calculation;
    const days = remainingDays ?? 0;
    const distance = remainingKm ?? 0;
    const detail = kind === 'date'
      ? days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`
      : distance <= 0 ? `${this.km(Math.abs(distance))} overdue` : `Due in ${this.km(distance)}`;
    return {
      id: record.id,
      title: record.title,
      recordType: record.type,
      recordSubtype: record.subtype,
      mode: record.reminderMode,
      kind,
      severity,
      detail,
      dueAt: dueDate?.toISOString() ?? null,
      daysRemaining: remainingDays,
      dueOdometerKm,
      remainingKm,
      currentOdometerKm,
    };
  }

  private km(value: number) { return `${Math.round(value * 10) / 10} km`; }
}
