export interface SavedLocationProps {
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  notes?: string | null;
}

export class SavedLocation {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly name: string,
    readonly latitude: number,
    readonly longitude: number,
    readonly notes: string | null,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static create(props: SavedLocationProps): SavedLocation {
    const now = new Date();
    return new SavedLocation(
      crypto.randomUUID(),
      props.userId,
      props.name,
      props.latitude,
      props.longitude,
      props.notes ?? null,
      now,
      now,
    );
  }
}
