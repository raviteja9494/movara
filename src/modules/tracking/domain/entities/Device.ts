export class Device {
  constructor(
    readonly id: string,
    readonly imei: string,
    readonly name: string | null,
    readonly createdAt: Date,
  ) {}

  static create(imei: string, name?: string): Device {
    return new Device(
      crypto.randomUUID(),
      imei,
      name ?? null,
      new Date(),
    );
  }
}
