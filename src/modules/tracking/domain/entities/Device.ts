export class Device {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly imei: string,
    readonly name: string | null,
    readonly osmandSecretHash: string | null,
    readonly createdAt: Date,
  ) {}

  static create(userId: string, imei: string, name?: string, osmandSecretHash?: string | null): Device {
    return new Device(
      crypto.randomUUID(),
      userId,
      imei,
      name ?? null,
      osmandSecretHash ?? null,
      new Date(),
    );
  }
}
