import { Position, Device } from '../../domain/entities';
import { PositionRepository, DeviceRepository } from '../../domain/repositories';
import { eventDispatcher } from '../../../shared/utils';
import { deviceStateStore } from '../../infrastructure/device/DeviceStateStore';

/**
 * Input DTO for ProcessIncomingPosition use case
 */
export interface ProcessIncomingPositionRequest {
  deviceId: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
  speed?: number;
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
    readonly latitude: number,
    readonly longitude: number,
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
  constructor(
    private positionRepository: PositionRepository,
    private deviceRepository: DeviceRepository,
  ) {}

  async execute(request: ProcessIncomingPositionRequest): Promise<Position> {
    // Validate input
    this.validateRequest(request);

    // Update device lastSeen immediately on receipt
    deviceStateStore.updateLastSeen(request.deviceId, request.timestamp);

    // Emit lightweight "position.received" event for subscribers (fire-and-forget)
    const receivedEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      aggregateId: request.deviceId,
      deviceId: request.deviceId,
      timestamp: request.timestamp,
      latitude: request.latitude,
      longitude: request.longitude,
      speed: request.speed,
    } as any;
    void eventDispatcher.dispatch('position.received', receivedEvent);

    // Ensure device exists: find by IMEI and create if missing. The
    // repository abstraction handles persistence; this logic lives in
    // the application layer (not in parser / transport).
    const imei = request.deviceId;
    let device = await this.deviceRepository.findByImei(imei);
    if (!device) {
      const newDevice = Device.create(imei);
      device = await this.deviceRepository.create(newDevice);
    }

    const internalDeviceId = device.id;

    // Lightweight deduplication: fetch last recorded position for device
    // and skip persisting if latitude/longitude and timestamp haven't
    // meaningfully changed. Thresholds are conservative and keep logic
    // intentionally lightweight.
    const last = (await this.positionRepository.findByDeviceId(internalDeviceId, 1))[0];
    if (last) {
      const latDelta = Math.abs(last.latitude - request.latitude);
      const lonDelta = Math.abs(last.longitude - request.longitude);
      const timeDeltaMs = Math.abs(last.timestamp.getTime() - request.timestamp.getTime());

      const LAT_LON_EPS = 1e-5; // ~1.1 meter
      const TIME_EPS_MS = 5000; // 5 seconds

      if (latDelta <= LAT_LON_EPS && lonDelta <= LAT_LON_EPS && timeDeltaMs <= TIME_EPS_MS) {
        // Considered duplicate of last recorded position — return last without saving
        return last;
      }
    }

    // Create domain entity using internal device id
    const position = Position.create(
      internalDeviceId,
      request.timestamp,
      request.latitude,
      request.longitude,
      request.speed,
    );

    // Persist to repository
    const savedPosition = await this.positionRepository.save(position);

    // Emit domain event
    const event = new PositionRecordedEvent(
      savedPosition.id,
      savedPosition.deviceId,
      savedPosition.latitude,
      savedPosition.longitude,
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
}
