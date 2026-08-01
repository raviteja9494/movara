import { computeTripStats } from '../../../../shared/utils';
import { NotFoundError } from '../../../../shared/errors';
import { Vehicle, type VehicleProps } from '../../domain/entities';
import type { OwnershipPolicy } from '../../../../shared/authorization';
import type {
  InsuranceUpdate,
  VehicleDetails,
  VehicleRepository,
  VehicleTravelRepository,
  VehicleUpdate,
} from '../../domain/repositories';

export class VehicleUseCases {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly travel: VehicleTravelRepository,
    private readonly ownership: OwnershipPolicy,
  ) {}

  async list(userId: string, page: number, limit: number): Promise<{ items: VehicleDetails[]; total: number }> {
    this.ownership.requireActor(userId);
    const result = await this.vehicles.listVehicleDetails(userId, (page - 1) * limit, limit);
    return { ...result, items: await Promise.all(result.items.map((item) => this.refreshEstimate(userId, item))) };
  }

  async get(userId: string, id: string): Promise<VehicleDetails> {
    await this.ownership.assertOwns(userId, 'vehicle', id);
    const vehicle = await this.vehicles.findVehicleDetailsById(userId, id);
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    return this.refreshEstimate(userId, vehicle);
  }

  async create(userId: string, input: Omit<VehicleProps, 'userId'>): Promise<VehicleDetails> {
    this.ownership.requireActor(userId);
    if (input.deviceId) await this.ownership.assertOwns(userId, 'device', input.deviceId);
    const calibrated = this.withCalibration({ ...input, userId });
    const created = await this.vehicles.createVehicle(Vehicle.create(calibrated));
    return this.get(userId, created.id);
  }

  async update(userId: string, id: string, input: VehicleUpdate & InsuranceUpdate): Promise<VehicleDetails> {
    await this.ownership.assertOwns(userId, 'vehicle', id);
    if (input.deviceId) await this.ownership.assertOwns(userId, 'device', input.deviceId);
    if (!await this.vehicles.findVehicleById(userId, id)) throw new NotFoundError('Vehicle', id);
    await this.vehicles.updateVehicle(userId, id, this.withCalibration(input));
    await this.vehicles.syncInsuranceRecords(userId, id, input);
    return this.get(userId, id);
  }

  async savePhoto(userId: string, id: string, photo: { path: string; data: Buffer; mimeType: string; filename: string }): Promise<VehicleDetails> {
    await this.ownership.assertOwns(userId, 'vehicle', id);
    await this.vehicles.savePhoto(userId, id, photo);
    return this.get(userId, id);
  }

  async getPhoto(userId: string, id: string) {
    await this.ownership.assertOwns(userId, 'vehicle', id);
    return this.vehicles.getPhoto(userId, id);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.ownership.assertOwns(userId, 'vehicle', id);
    await this.vehicles.delete(userId, id);
  }

  private withCalibration<T extends VehicleUpdate | VehicleProps>(input: T): T & VehicleUpdate {
    if (typeof input.currentOdometer !== 'number') return input;
    const now = new Date();
    return {
      ...input,
      estimatedOdometerKm: input.currentOdometer,
      estimatedOdometerBaseKm: input.currentOdometer,
      estimatedOdometerBaseAt: now,
      estimatedOdometerUpdatedAt: now,
    };
  }

  private async refreshEstimate(userId: string, details: VehicleDetails): Promise<VehicleDetails> {
    const vehicle = details.vehicle;
    if (vehicle.estimatedOdometerBaseKm == null || vehicle.estimatedOdometerBaseAt == null) return details;
    const latestEnd = await this.travel.findLatestStoredTripEnd(userId, vehicle.id, vehicle.estimatedOdometerBaseAt);
    const baseKm = vehicle.estimatedOdometerBaseKm;
    if (!latestEnd) {
      if (vehicle.estimatedOdometerKm === baseKm && vehicle.estimatedOdometerUpdatedAt != null) return details;
      return this.replaceEstimate(userId, details, baseKm);
    }
    if (vehicle.estimatedOdometerKm != null && vehicle.estimatedOdometerUpdatedAt != null && vehicle.estimatedOdometerUpdatedAt >= latestEnd) {
      return details;
    }
    const trips = await this.travel.findStoredTrips(userId, vehicle.id, vehicle.estimatedOdometerBaseAt);
    let totalKm = 0;
    for (const trip of trips) {
      const from = trip.startTime > vehicle.estimatedOdometerBaseAt ? trip.startTime : vehicle.estimatedOdometerBaseAt;
      const points = trip.source === 'imported'
        ? await this.travel.findImportedTripPoints(userId, trip.id, from, trip.endTime)
        : trip.deviceId
          ? await this.travel.findDevicePositions(userId, trip.deviceId, from, trip.endTime)
          : [];
      if (points.length >= 2) totalKm += computeTripStats(points).odometerKm;
    }
    return this.replaceEstimate(userId, details, Math.round((baseKm + totalKm) * 1000) / 1000);
  }

  private async replaceEstimate(userId: string, details: VehicleDetails, value: number): Promise<VehicleDetails> {
    const updatedAt = new Date();
    await this.travel.updateEstimatedOdometer(userId, details.vehicle.id, value, updatedAt);
    return {
      ...details,
      vehicle: new Vehicle(
        details.vehicle.id, details.vehicle.userId, details.vehicle.name, details.vehicle.description, details.vehicle.createdAt,
        details.vehicle.licensePlate, details.vehicle.vin, details.vehicle.year, details.vehicle.make,
        details.vehicle.model, details.vehicle.currentOdometer, value, details.vehicle.estimatedOdometerBaseKm,
        details.vehicle.estimatedOdometerBaseAt, updatedAt, details.vehicle.fuelType, details.vehicle.icon,
        details.vehicle.photoPath, details.vehicle.deviceId,
      ),
    };
  }
}
