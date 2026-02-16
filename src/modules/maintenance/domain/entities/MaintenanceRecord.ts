export type MaintenanceType = 'service' | 'repair' | 'inspection' | 'other';

export class MaintenanceRecord {
  constructor(
    readonly id: string,
    readonly vehicleId: string,
    readonly type: MaintenanceType,
    readonly notes: string | null,
    readonly odometer: number | null,
    readonly cost: number | null,
    readonly date: Date,
    readonly createdAt: Date,
    readonly receiptPath: string | null = null,
  ) {}

  static create(
    vehicleId: string,
    type: MaintenanceType,
    date: Date,
    notes?: string,
    odometer?: number,
    cost?: number,
  ): MaintenanceRecord {
    return new MaintenanceRecord(
      crypto.randomUUID(),
      vehicleId,
      type,
      notes ?? null,
      odometer ?? null,
      cost ?? null,
      date,
      new Date(),
      null,
    );
  }
}
