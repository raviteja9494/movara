export type MaintenanceType = 'service' | 'repair' | 'inspection' | 'other';

export interface VehicleRecordProps {
  userId: string;
  vehicleId: string;
  type: string;
  subtype?: string | null;
  title: string;
  notes?: string | null;
  amount?: number | null;
  odometer?: number | null;
  date: Date;
  validFrom?: Date | null;
  validUntil?: Date | null;
  provider?: string | null;
  referenceNumber?: string | null;
  reminderMode?: string;
  reminderDaysBefore?: number | null;
  recurringIntervalDays?: number | null;
  recurringIntervalKm?: number | null;
}

export class VehicleRecord {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly vehicleId: string,
    readonly type: string,
    readonly subtype: string | null,
    readonly title: string,
    readonly notes: string | null,
    readonly amount: number | null,
    readonly odometer: number | null,
    readonly date: Date,
    readonly validFrom: Date | null,
    readonly validUntil: Date | null,
    readonly provider: string | null,
    readonly referenceNumber: string | null,
    readonly reminderMode: string,
    readonly reminderDaysBefore: number | null,
    readonly recurringIntervalDays: number | null,
    readonly recurringIntervalKm: number | null,
    readonly attachmentPath: string | null,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly vehicleName: string | null = null,
  ) {}

  static create(props: VehicleRecordProps): VehicleRecord {
    const now = new Date();
    return new VehicleRecord(
      crypto.randomUUID(), props.userId, props.vehicleId, props.type, props.subtype ?? null, props.title,
      props.notes ?? null, props.amount ?? null, props.odometer ?? null, props.date,
      props.validFrom ?? null, props.validUntil ?? null, props.provider ?? null,
      props.referenceNumber ?? null, props.reminderMode ?? 'none', props.reminderDaysBefore ?? null,
      props.recurringIntervalDays ?? null, props.recurringIntervalKm ?? null, null, now, now,
    );
  }

  static defaultTitle(type: string, subtype?: string | null): string {
    if (type === 'maintenance') {
      return subtype === 'service' ? 'Service' : subtype === 'repair' ? 'Repair' : subtype === 'inspection' ? 'Inspection' : 'Maintenance record';
    }
    if (type === 'document') {
      const titles: Record<string, string> = {
        insurance_third_party: 'Third-party insurance', insurance_own_damage: 'Own damage insurance',
        pollution_check: 'Pollution check', registration: 'Registration', permit: 'Permit', warranty: 'Warranty',
      };
      return subtype ? titles[subtype] ?? 'Document' : 'Document';
    }
    if (type === 'subscription') return subtype === 'sim_recharge' ? 'SIM recharge' : 'Subscription';
    if (type === 'accessory') return subtype === 'tracker_purchase' ? 'Tracker purchase' : 'Accessory';
    return 'Vehicle expense';
  }
}
