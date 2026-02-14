/** Distance unit for display */
export type DistanceUnit = 'km' | 'mi';

/** Fuel volume unit for display */
export type FuelVolumeUnit = 'L' | 'gal';

const STORAGE_KEY = 'movara_preferences';

export interface Preferences {
  distanceUnit: DistanceUnit;
  fuelVolumeUnit: FuelVolumeUnit;
}

const defaults: Preferences = {
  distanceUnit: 'km',
  fuelVolumeUnit: 'L',
};

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      distanceUnit: parsed.distanceUnit === 'mi' ? 'mi' : 'km',
      fuelVolumeUnit: parsed.fuelVolumeUnit === 'gal' ? 'gal' : 'L',
    };
  } catch {
    return { ...defaults };
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/** 1 km in miles */
const KM_PER_MI = 1.609344;
/** 1 US gallon in liters */
const L_PER_GAL = 3.785411784;

export function kmToMi(km: number): number {
  return km / KM_PER_MI;
}

export function miToKm(mi: number): number {
  return mi * KM_PER_MI;
}

export function LToGal(L: number): number {
  return L / L_PER_GAL;
}

export function galToL(gal: number): number {
  return gal * L_PER_GAL;
}
