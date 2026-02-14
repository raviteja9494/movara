export class Position {
  constructor(
    readonly id: string,
    readonly deviceId: string,
    readonly timestamp: Date,
    readonly latitude: number,
    readonly longitude: number,
    readonly speed: number | null,
    readonly createdAt: Date,
    readonly attributes: Record<string, unknown> | null = null,
  ) {}

  static create(
    deviceId: string,
    timestamp: Date,
    latitude: number,
    longitude: number,
    speed?: number,
    attributes?: Record<string, unknown> | null,
  ): Position {
    return new Position(
      crypto.randomUUID(),
      deviceId,
      timestamp,
      latitude,
      longitude,
      speed ?? null,
      new Date(),
      attributes ?? null,
    );
  }
}
