export type MaintenanceType = 'service' | 'fuel' | 'repair' | 'inspection' | 'other';

export class MaintenanceRecord {
  constructor(
    readonly id: string,
    readonly vehicleId: string,
    readonly type: MaintenanceType,
    readonly notes: string | null,
    readonly odometer: number | null,
    readonly date: Date,
    readonly createdAt: Date,
  ) {}

  static create(
    vehicleId: string,
    type: MaintenanceType,
    date: Date,
    notes?: string,
    odometer?: number,
  ): MaintenanceRecord {
    return new MaintenanceRecord(
      crypto.randomUUID(),
      vehicleId,
      type,
      notes ?? null,
      odometer ?? null,
      date,
      new Date(),
    );
  }
}
