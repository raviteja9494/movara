import { NotFoundError } from '../../../../shared/errors';
import { FuelRecord } from '../../domain/entities';
import type { FuelRecordRepository, VehicleRepository } from '../../domain/repositories';
import type { OwnershipPolicy } from '../../../../shared/authorization';

export interface FuelRecordInput {
  date: Date;
  odometer: number;
  fuelQuantity: number;
  fuelCost?: number | null;
  fuelRate?: number | null;
}

export class FuelRecordUseCases {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly fuelRecords: FuelRecordRepository,
    private readonly ownership: OwnershipPolicy,
  ) {}

  async list(userId: string, vehicleId: string) {
    await this.requireVehicle(userId, vehicleId);
    return this.fuelRecords.findByVehicleId(userId, vehicleId);
  }

  async create(userId: string, vehicleId: string, input: FuelRecordInput) {
    const vehicle = await this.requireVehicle(userId, vehicleId);
    const position = vehicle.deviceId
      ? await this.fuelRecords.findDevicePositionAt(userId, vehicle.deviceId, input.date)
      : null;
    const created = await this.fuelRecords.create(FuelRecord.create({
      userId,
      vehicleId,
      ...input,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
    }));
    await this.syncOdometer(userId, vehicleId);
    return created;
  }

  async update(userId: string, vehicleId: string, recordId: string, input: Partial<FuelRecordInput>) {
    await this.requireVehicle(userId, vehicleId);
    await this.ownership.assertOwns(userId, 'fuelRecord', recordId);
    const existing = await this.fuelRecords.findByIdForVehicle(userId, recordId, vehicleId);
    if (!existing) throw new NotFoundError('FuelRecord', recordId);
    if (Object.keys(input).length === 0) return existing;
    const updated = await this.fuelRecords.update(userId, recordId, input);
    if (!updated) throw new NotFoundError('FuelRecord', recordId);
    await this.syncOdometer(userId, vehicleId);
    return updated;
  }

  async delete(userId: string, vehicleId: string, recordId: string): Promise<void> {
    await this.requireVehicle(userId, vehicleId);
    await this.ownership.assertOwns(userId, 'fuelRecord', recordId);
    if (!await this.fuelRecords.findByIdForVehicle(userId, recordId, vehicleId)) throw new NotFoundError('FuelRecord', recordId);
    await this.fuelRecords.delete(userId, recordId);
    await this.syncOdometer(userId, vehicleId);
  }

  private async requireVehicle(userId: string, id: string) {
    await this.ownership.assertOwns(userId, 'vehicle', id);
    const vehicle = await this.vehicles.findVehicleById(userId, id);
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    return vehicle;
  }

  private async syncOdometer(userId: string, vehicleId: string): Promise<void> {
    const latest = await this.fuelRecords.findLatestByVehicleId(userId, vehicleId);
    if (!latest) return;
    await this.vehicles.updateVehicle(userId, vehicleId, {
      currentOdometer: latest.odometer,
      estimatedOdometerKm: latest.odometer,
      estimatedOdometerBaseKm: latest.odometer,
      estimatedOdometerBaseAt: latest.date,
      estimatedOdometerUpdatedAt: new Date(),
    });
  }
}
