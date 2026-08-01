import { haversineKm } from '../../../../shared/utils';
import { NotFoundError } from '../../../../shared/errors';
import type { TravelPoint, VehicleRepository, VehicleTravelRepository } from '../../domain/repositories';
import type { OwnershipPolicy } from '../../../../shared/authorization';

const TRIP_GAP_MS = 30 * 60 * 1000;
const TRIP_MERGE_TOLERANCE_MS = 2000;

export interface DerivedVehicleTrip {
  startedAt: Date;
  endedAt: Date;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  distanceKm: number;
  pointCount: number;
}

export class VehicleTravelUseCases {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly travel: VehicleTravelRepository,
    private readonly ownership: OwnershipPolicy,
  ) {}

  async listDerivedTrips(userId: string, vehicleId: string, from: Date, to: Date): Promise<DerivedVehicleTrip[]> {
    const vehicle = await this.requireVehicle(userId, vehicleId);
    if (!vehicle.deviceId) return [];
    const [positions, merges] = await Promise.all([
      this.travel.findDevicePositions(userId, vehicle.deviceId, from, to),
      this.travel.findTripMerges(userId, vehicle.deviceId),
    ]);
    const groups: TravelPoint[][] = [];
    let current: TravelPoint[] = [];
    for (const position of positions) {
      const previous = current[current.length - 1];
      const gapExceeds = previous && position.timestamp.getTime() - previous.timestamp.getTime() > TRIP_GAP_MS;
      const merged = previous && merges.some((merge) =>
        Math.abs(merge.gapAfter.getTime() - previous.timestamp.getTime()) <= TRIP_MERGE_TOLERANCE_MS &&
        Math.abs(merge.gapBefore.getTime() - position.timestamp.getTime()) <= TRIP_MERGE_TOLERANCE_MS,
      );
      if (gapExceeds && !merged) {
        if (current.length) groups.push(current);
        current = [position];
      } else {
        current.push(position);
      }
    }
    if (current.length) groups.push(current);
    return groups.map((points) => this.toDerivedTrip(points));
  }

  async listMerges(userId: string, vehicleId: string) {
    const vehicle = await this.requireVehicle(userId, vehicleId);
    return vehicle.deviceId ? this.travel.findTripMerges(userId, vehicle.deviceId) : [];
  }

  async createMerge(userId: string, vehicleId: string, gapAfter: Date, gapBefore: Date) {
    const vehicle = await this.requireVehicle(userId, vehicleId);
    if (!vehicle.deviceId) return null;
    return this.travel.createTripMerge(userId, vehicle.deviceId, gapAfter, gapBefore);
  }

  async deleteMerge(userId: string, vehicleId: string, gapAfter: Date, gapBefore: Date): Promise<'deleted' | 'missing-device'> {
    const vehicle = await this.requireVehicle(userId, vehicleId);
    if (!vehicle.deviceId) return 'missing-device';
    await this.travel.deleteTripMergesNear(userId, vehicle.deviceId, gapAfter, gapBefore, TRIP_MERGE_TOLERANCE_MS);
    return 'deleted';
  }

  private async requireVehicle(userId: string, id: string) {
    await this.ownership.assertOwns(userId, 'vehicle', id);
    const vehicle = await this.vehicles.findVehicleById(userId, id);
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    return vehicle;
  }

  private toDerivedTrip(points: TravelPoint[]): DerivedVehicleTrip {
    const start = points[0];
    const end = points[points.length - 1];
    let distanceKm = 0;
    for (let index = 1; index < points.length; index += 1) {
      distanceKm += haversineKm(
        points[index - 1].latitude,
        points[index - 1].longitude,
        points[index].latitude,
        points[index].longitude,
      );
    }
    return {
      startedAt: start.timestamp,
      endedAt: end.timestamp,
      startLat: start.latitude,
      startLon: start.longitude,
      endLat: end.latitude,
      endLon: end.longitude,
      distanceKm: Math.round(distanceKm * 1000) / 1000,
      pointCount: points.length,
    };
  }
}
