export interface VehicleProps {
  userId: string;
  name: string;
  description?: string | null;
  licensePlate?: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  currentOdometer?: number | null;
  estimatedOdometerKm?: number | null;
  estimatedOdometerBaseKm?: number | null;
  estimatedOdometerBaseAt?: Date | null;
  estimatedOdometerUpdatedAt?: Date | null;
  fuelType?: string | null;
  icon?: string | null;
  photoPath?: string | null;
  deviceId?: string | null;
}

export class Vehicle {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly name: string,
    readonly description: string | null,
    readonly createdAt: Date,
    readonly licensePlate: string | null = null,
    readonly vin: string | null = null,
    readonly year: number | null = null,
    readonly make: string | null = null,
    readonly model: string | null = null,
    readonly currentOdometer: number | null = null,
    readonly estimatedOdometerKm: number | null = null,
    readonly estimatedOdometerBaseKm: number | null = null,
    readonly estimatedOdometerBaseAt: Date | null = null,
    readonly estimatedOdometerUpdatedAt: Date | null = null,
    readonly fuelType: string | null = null,
    readonly icon: string | null = null,
    readonly photoPath: string | null = null,
    readonly deviceId: string | null = null,
  ) {}

  static create(props: VehicleProps): Vehicle {
    return new Vehicle(
      crypto.randomUUID(),
      props.userId,
      props.name,
      props.description ?? null,
      new Date(),
      props.licensePlate ?? null,
      props.vin ?? null,
      props.year ?? null,
      props.make ?? null,
      props.model ?? null,
      props.currentOdometer ?? null,
      props.estimatedOdometerKm ?? props.currentOdometer ?? null,
      props.estimatedOdometerBaseKm ?? props.currentOdometer ?? null,
      props.estimatedOdometerBaseAt ?? (props.currentOdometer != null ? new Date() : null),
      props.estimatedOdometerUpdatedAt ?? (props.currentOdometer != null ? new Date() : null),
      props.fuelType ?? null,
      props.icon ?? null,
      props.photoPath ?? null,
      props.deviceId ?? null,
    );
  }
}

export interface FuelRecordProps {
  userId: string;
  vehicleId: string;
  date: Date;
  odometer: number;
  fuelQuantity: number;
  fuelCost?: number | null;
  fuelRate?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export class FuelRecord {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly vehicleId: string,
    readonly date: Date,
    readonly odometer: number,
    readonly fuelQuantity: number,
    readonly fuelCost: number | null,
    readonly fuelRate: number | null,
    readonly latitude: number | null,
    readonly longitude: number | null,
    readonly createdAt: Date,
  ) {}

  static create(props: FuelRecordProps): FuelRecord {
    let cost = props.fuelCost ?? null;
    let rate = props.fuelRate ?? null;
    if (cost != null && props.fuelQuantity > 0 && rate == null) {
      rate = cost / props.fuelQuantity;
    }
    if (rate != null && props.fuelQuantity > 0 && cost == null) {
      cost = rate * props.fuelQuantity;
    }
    return new FuelRecord(
      crypto.randomUUID(),
      props.userId,
      props.vehicleId,
      props.date,
      props.odometer,
      props.fuelQuantity,
      cost,
      rate,
      props.latitude ?? null,
      props.longitude ?? null,
      new Date(),
    );
  }
}
