export type VehicleReminderStatus = 'none' | 'ok' | 'due' | 'overdue';

export interface VehicleReminderSummaryItem {
  recordId: string;
  title: string;
  status: 'due' | 'overdue';
  dueDate: string | null;
  dueOdometerKm: number | null;
  remainingDays: number | null;
  remainingKm: number | null;
}

export interface VehicleReminderSummaryPort {
  getForVehicle(
    userId: string,
    vehicleId: string,
    odometerKm: number | null,
    now: Date,
  ): Promise<{ status: VehicleReminderStatus; items: VehicleReminderSummaryItem[] }>;
}
