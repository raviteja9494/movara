import { Position } from '../../domain/entities';
import { PositionRepository, DeviceRepository } from '../../domain/repositories';
import { eventDispatcher } from '../../../../shared/utils';
import type { DeviceStateStore } from '../../infrastructure/device/DeviceStateStore';

/**
 * Input DTO for ProcessIncomingPosition use case
 */
export interface ProcessIncomingPositionRequest {
  actorId?: string;
  deviceId: string;
  timestamp: Date;
  receivedAt?: Date;
  latitude: number;
  longitude: number;
  speed?: number;
  /** Optional extras (e.g. OsmAnd: accuracy, altitude, battery, activity) */
  attributes?: Record<string, unknown> | null;
}

/**
 * Domain event emitted when position is recorded
 */
export class PositionRecordedEvent {
  readonly eventId: string = crypto.randomUUID();
  readonly occurredAt: Date = new Date();

  constructor(
    readonly aggregateId: string, // Position ID
    readonly deviceId: string,
    readonly timestamp: Date,
    readonly latitude: number,
    readonly longitude: number,
    readonly attributes: Record<string, unknown> | null,
  ) {}
}

export class DeviceTelemetryEvent {
  readonly eventId: string = crypto.randomUUID();
  readonly occurredAt: Date = new Date();

  constructor(
    readonly aggregateId: string,
    readonly deviceId: string,
    readonly timestamp: Date,
    readonly attributes: Record<string, unknown> | null,
  ) {}
}

/**
 * ProcessIncomingPosition Use Case
 * 
 * Responsibility:
 * 1. Validate incoming GPS data
 * 2. Create domain entity
 * 3. Persist via repository
 * 4. Emit domain event for subscribers
 */
export class ProcessIncomingPositionUseCase {
  private static readonly MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

  constructor(
    private positionRepository: PositionRepository,
    private deviceRepository: DeviceRepository,
    private deviceStateStore: DeviceStateStore,
  ) {}

  async execute(request: ProcessIncomingPositionRequest): Promise<Position> {
    // Validate input
    this.validateRequest(request);

    const receivedAt = request.receivedAt ?? new Date();
    const timestamp = this.normalizeTimestamp(request.timestamp, receivedAt);
    const attributes = this.normalizeAttributes(request.attributes ?? null, request.timestamp, timestamp, receivedAt);

    const device = await this.deviceRepository.findByImei(request.deviceId);
    if (!device) throw new Error('Device is not provisioned');
    if (request.actorId && request.actorId !== device.userId) throw new Error('Device is not provisioned');

    // Device reachability should reflect foreground tracker state when the
    // companion app provides it; otherwise any fresh packet means reachable.
    if (attributes?.tracker_active === false) {
      await this.deviceStateStore.setStatus(request.deviceId, 'offline', receivedAt);
    } else {
      await this.deviceStateStore.updateLastSeen(request.deviceId, receivedAt);
    }
    await this.deviceStateStore.updateLastAttributes(request.deviceId, attributes ?? undefined);

    // Emit lightweight "position.received" event for subscribers (fire-and-forget)
    const receivedEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      aggregateId: request.deviceId,
      deviceId: request.deviceId,
      timestamp,
      receivedAt,
      latitude: request.latitude,
      longitude: request.longitude,
      speed: request.speed,
    } as any;
    void eventDispatcher.dispatch('position.received', receivedEvent);

    const internalDeviceId = device.id;

    // Lightweight deduplication: fetch last recorded position for device
    // and skip persisting if latitude/longitude and timestamp haven't
    // meaningfully changed. Thresholds are conservative and keep logic
    // intentionally lightweight.
    const last = (await this.positionRepository.findByDeviceId(internalDeviceId, 1))[0];
    if (last) {
      const latDelta = Math.abs(last.latitude - request.latitude);
      const lonDelta = Math.abs(last.longitude - request.longitude);
      const timeDeltaMs = Math.abs(last.timestamp.getTime() - timestamp.getTime());

      const LAT_LON_EPS = 1e-5; // ~1.1 meter
      const TIME_EPS_MS = 5000; // 5 seconds

      if (latDelta <= LAT_LON_EPS && lonDelta <= LAT_LON_EPS && timeDeltaMs <= TIME_EPS_MS) {
        // Considered duplicate of last recorded position — return last without saving
        return last;
      }
    }

    // Create domain entity using internal device id
    const position = Position.create(
      device.userId,
      internalDeviceId,
      timestamp,
      request.latitude,
      request.longitude,
      request.speed,
      attributes,
    );

    // Persist to repository
    const savedPosition = await this.positionRepository.save(position);

    // Emit domain event
    const event = new PositionRecordedEvent(
      savedPosition.id,
      savedPosition.deviceId,
      savedPosition.timestamp,
      savedPosition.latitude,
      savedPosition.longitude,
      savedPosition.attributes,
    );
    await eventDispatcher.dispatch('position.recorded', event);

    return savedPosition;
  }

  private validateRequest(request: ProcessIncomingPositionRequest): void {
    if (!request.deviceId) {
      throw new Error('deviceId is required');
    }

    if (!request.timestamp) {
      throw new Error('timestamp is required');
    }
    if (!(request.timestamp instanceof Date) || Number.isNaN(request.timestamp.getTime())) {
      throw new Error('timestamp must be a valid date');
    }

    if (
      typeof request.latitude !== 'number' ||
      request.latitude < -90 ||
      request.latitude > 90
    ) {
      throw new Error('latitude must be a number between -90 and 90');
    }

    if (
      typeof request.longitude !== 'number' ||
      request.longitude < -180 ||
      request.longitude > 180
    ) {
      throw new Error('longitude must be a number between -180 and 180');
    }

    if (
      request.speed !== undefined &&
      (typeof request.speed !== 'number' || request.speed < 0)
    ) {
      throw new Error('speed must be a non-negative number');
    }
  }

  private normalizeTimestamp(timestamp: Date, receivedAt: Date): Date {
    if (timestamp.getTime() - receivedAt.getTime() > ProcessIncomingPositionUseCase.MAX_FUTURE_SKEW_MS) {
      return receivedAt;
    }
    return timestamp;
  }

  private normalizeAttributes(
    attributes: Record<string, unknown> | null,
    originalTimestamp: Date,
    normalizedTimestamp: Date,
    receivedAt: Date,
  ): Record<string, unknown> | null {
    if (normalizedTimestamp.getTime() === originalTimestamp.getTime()) {
      return attributes;
    }
    return {
      ...(attributes ?? {}),
      original_timestamp: originalTimestamp.toISOString(),
      received_at: receivedAt.toISOString(),
      timestamp_adjusted: true,
    };
  }
}
