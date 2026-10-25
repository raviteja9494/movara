import { summarizeFuelRecords } from '../../../../shared/vehicleDerivedValues';
import type { FuelRecordUseCases } from './FuelRecordUseCases';
import type { VehicleUseCases } from './VehicleUseCases';
import type { VehicleReminderSummaryPort } from '../ports/VehicleReminderSummaryPort';

export class VehicleSummaryUseCases {
  constructor(
    private readonly vehicles: VehicleUseCases,
    private readonly fuelRecords: FuelRecordUseCases,
    private readonly reminders: VehicleReminderSummaryPort,
  ) {}

  async getForVehicle(userId: string, vehicleId: string, range: { from?: Date; to?: Date } = {}) {
    const [details, allFuelRecords] = await Promise.all([
      this.vehicles.get(userId, vehicleId),
      this.fuelRecords.list(userId, vehicleId),
    ]);
    const fuelRecords = allFuelRecords.filter((record) =>
      (range.from == null || record.date >= range.from)
      && (range.to == null || record.date <= range.to));
    const odometerKm = details.vehicle.estimatedOdometerKm ?? details.vehicle.currentOdometer ?? null;
    const reminders = await this.reminders.getForVehicle(userId, vehicleId, odometerKm, new Date());

    return {
      summary: {
        vehicleId,
        odometerKm,
        fuel: summarizeFuelRecords(fuelRecords),
        reminders,
      },
    };
  }
}
