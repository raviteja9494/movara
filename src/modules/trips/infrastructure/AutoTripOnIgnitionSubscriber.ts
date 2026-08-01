import type { PrismaClient } from '@prisma/client';
import type { DeviceTelemetryEvent, PositionRecordedEvent } from '../../tracking/application/use-cases';

export class AutoTripOnIgnitionSubscriber {
  private static readonly ACTIVE_SOURCE = 'auto-ignition-active';
  private static readonly FINAL_SOURCE = 'auto-ignition';
  private static readonly MIN_TRIP_DURATION_MS = 30 * 1000;

  constructor(private readonly prisma: PrismaClient) {}

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
    if (!this.shouldUseIgnition(event.attributes)) return;
    const ignition = this.readIgnition(event.attributes);
    if (ignition == null) return;

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { deviceId: event.deviceId },
      orderBy: { createdAt: 'asc' },
    });
    if (!vehicle) return;

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        userId: vehicle.userId,
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
          await this.prisma.trip.update({
            where: { id: activeTrip.id },
            data: { endTime: safeEndTime },
          });
        }
        return;
      }

      await this.prisma.trip.create({
        data: {
          userId: vehicle.userId,
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

    await this.prisma.trip.update({
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

  private shouldUseIgnition(attributes: Record<string, unknown> | null): boolean {
    if (!attributes) return false;
    const protocol = typeof attributes.tracking_protocol === 'string' ? attributes.tracking_protocol : null;
    const packetId = typeof attributes.tracking_packet_id === 'string' ? attributes.tracking_packet_id : null;

    if (protocol === 'gt06') {
      return packetId === '0x13' || packetId === '0x22';
    }

    if (protocol === 'eelink') {
      return packetId === '0x07';
    }

    return true;
  }
}
