export class Vehicle {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string | null,
    readonly createdAt: Date,
  ) {}

  static create(name: string, description?: string): Vehicle {
    return new Vehicle(
      crypto.randomUUID(),
      name,
      description ?? null,
      new Date(),
    );
  }
}
