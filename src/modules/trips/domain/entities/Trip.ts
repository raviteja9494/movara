export interface TripRelation { id: string; name?: string | null; imei?: string }
export interface TripPoint { latitude: number; longitude: number; timestamp: Date; speed: number | null; attributes?: Record<string, unknown> | null; sortOrder?: number }
export interface TripStop { id: string; tripId: string; label: string; startTime: Date; endTime: Date | null; latitude: number; longitude: number; sortOrder: number }
export interface TripGap { gapAfter: Date; gapBefore: Date }

export class Trip {
  constructor(
    readonly id: string, readonly userId: string, readonly deviceId: string | null, readonly device: TripRelation | null,
    readonly vehicleId: string | null, readonly vehicle: TripRelation | null, readonly startTime: Date,
    readonly endTime: Date, readonly name: string | null, readonly favorite: boolean,
    readonly source: string, readonly createdAt: Date,
  ) {}
}

export interface NewTrip {
  userId: string; deviceId?: string | null; vehicleId?: string | null; startTime: Date; endTime: Date;
  name?: string | null; favorite?: boolean; source: string; positions?: TripPoint[];
}
