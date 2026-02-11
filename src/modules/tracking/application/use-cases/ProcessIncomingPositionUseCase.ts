import { Position } from '../../domain/entities';
import { PositionRepository } from '../../domain/repositories';
import { eventDispatcher } from '../../../shared/utils';

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
  constructor(private positionRepository: PositionRepository) {}

  async execute(request: ProcessIncomingPositionRequest): Promise<Position> {
    // Validate input
    this.validateRequest(request);

    // Create domain entity
    const position = Position.create(
      request.deviceId,
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
