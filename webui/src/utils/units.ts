import type { DistanceUnit, FuelVolumeUnit } from '../settings/preferences';
import {
  kmToMi,
  LToGal,
} from '../settings/preferences';

/**
 * Format a distance value for display using the given unit.
 * Input is always in km (API standard).
 */
export function formatDistance(km: number, unit: DistanceUnit): string {
  const value = unit === 'mi' ? kmToMi(km) : km;
  const suffix = unit === 'mi' ? ' mi' : ' km';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + suffix;
}

/**
 * Format a fuel volume for display.
 * Input is always in liters (API standard).
 */
export function formatFuelVolume(L: number, unit: FuelVolumeUnit): string {
  const value = unit === 'gal' ? LToGal(L) : L;
  const suffix = unit === 'gal' ? ' gal' : ' L';
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suffix;
}

/**
 * Format fuel economy for display.
 * consumptionL100km = liters per 100 km. When unit is mi+gal we show MPG.
 */
export function formatFuelEconomy(
  consumptionL100km: number,
  distanceUnit: DistanceUnit,
  fuelVolumeUnit: FuelVolumeUnit
): string {
  if (distanceUnit === 'mi' && fuelVolumeUnit === 'gal') {
    if (consumptionL100km <= 0) return '— MPG';
    const mpg = 235.214583 / consumptionL100km; // 100 km / (L/100km) -> mi, then / gal
    return mpg.toFixed(1) + ' MPG';
  }
  return consumptionL100km.toFixed(1) + ' L/100 km';
}

/**
 * Convert distance from display unit back to km (for API).
 * Only needed when user types in mi - we'd convert to km before submit. For now we keep API in km and only convert for display.
 */
export function toKm(value: number, unit: DistanceUnit): number {
  if (unit === 'mi') return value * 1.609344;
  return value;
}

/**
 * Convert fuel volume from display unit back to L (for API).
 */
export function toLiters(value: number, unit: FuelVolumeUnit): number {
  if (unit === 'gal') return value * 3.785411784;
  return value;
}

/** Format speed. Input always km/h (API). */
export function formatSpeed(kmh: number, distanceUnit: DistanceUnit): string {
  if (distanceUnit === 'mi') {
    const mph = kmh / 1.609344;
    return mph.toFixed(1) + ' mph';
  }
  return kmh.toFixed(1) + ' km/h';
}
