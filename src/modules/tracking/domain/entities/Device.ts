export class Device {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly imei: string,
    readonly name: string | null,
    readonly createdAt: Date,
  ) {}

  static create(userId: string, imei: string, name?: string): Device {
    return new Device(
      crypto.randomUUID(),
      userId,
      imei,
      name ?? null,
      new Date(),
    );
  }
}
