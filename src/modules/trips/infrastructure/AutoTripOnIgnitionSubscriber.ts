import { getPrismaClient } from '../../../infrastructure/db';
import type { DeviceTelemetryEvent, PositionRecordedEvent } from '../../tracking/application/use-cases';

export class AutoTripOnIgnitionSubscriber {
  private static readonly ACTIVE_SOURCE = 'auto-ignition-active';
  private static readonly FINAL_SOURCE = 'auto-ignition';
  private static readonly MIN_TRIP_DURATION_MS = 30 * 1000;

  async handle(event: PositionRecordedEvent): Promise<void> {
    await this.handleIgnitionEvent({
      deviceId: event.deviceId,
      timestamp: event.timestamp,
      attributes: event.attributes,
    });
  }

  async handleTelemetry(event: DeviceTelemetryEvent): Promise<void> {
    await this.handleIgnitionEvent({
      deviceId: event.deviceId,
      timestamp: event.timestamp,
      attributes: event.attributes,
    });
  }

  private async handleIgnitionEvent(event: {
    deviceId: string;
    timestamp: Date;
    attributes: Record<string, unknown> | null;
  }): Promise<void> {
    const ignition = this.readIgnition(event.attributes);
    if (ignition == null) return;

    const prisma = getPrismaClient();
    const vehicle = await prisma.vehicle.findFirst({
      where: { deviceId: event.deviceId },
      orderBy: { createdAt: 'asc' },
    });
    if (!vehicle) return;

    const activeTrip = await prisma.trip.findFirst({
      where: {
        deviceId: event.deviceId,
        vehicleId: vehicle.id,
        source: AutoTripOnIgnitionSubscriber.ACTIVE_SOURCE,
      },
      orderBy: { startTime: 'desc' },
    });

    const safeEndTime = new Date(
      Math.max(
        event.timestamp.getTime(),
        event.timestamp.getTime() + AutoTripOnIgnitionSubscriber.MIN_TRIP_DURATION_MS,
      ),
    );

    if (ignition) {
      if (activeTrip) {
        if (safeEndTime.getTime() > activeTrip.endTime.getTime()) {
          await prisma.trip.update({
            where: { id: activeTrip.id },
            data: { endTime: safeEndTime },
          });
        }
        return;
      }

      await prisma.trip.create({
        data: {
          deviceId: event.deviceId,
          vehicleId: vehicle.id,
          startTime: event.timestamp,
          endTime: safeEndTime,
          name: null,
          source: AutoTripOnIgnitionSubscriber.ACTIVE_SOURCE,
        },
      });
      return;
    }

    if (!activeTrip) return;

    await prisma.trip.update({
      where: { id: activeTrip.id },
      data: {
        endTime: safeEndTime.getTime() > activeTrip.endTime.getTime() ? safeEndTime : activeTrip.endTime,
        source: AutoTripOnIgnitionSubscriber.FINAL_SOURCE,
      },
    });
  }

  private readIgnition(attributes: Record<string, unknown> | null): boolean | null {
    if (!attributes) return null;
    const value = attributes.ignition;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'off', 'no'].includes(normalized)) return false;
    }
    return null;
  }
}
