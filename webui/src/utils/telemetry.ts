export interface TelemetrySnapshot {
  ignition: boolean | null;
  batteryPercent: number | null;
  batteryVoltage: number | null;
  fuelLevel: number | null;
  rpm: number | null;
  coolantTemp: number | null;
  charging: boolean | null;
  gsmSignalPercent: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'off', 'no'].includes(normalized)) return false;
  }
  return null;
}

export function extractTelemetry(attributes?: Record<string, unknown>): TelemetrySnapshot | null {
  if (!attributes || Object.keys(attributes).length === 0) return null;
  const telemetry: TelemetrySnapshot = {
    ignition: booleanOrNull(attributes.ignition),
    batteryPercent: numberOrNull(attributes.battery_level),
    batteryVoltage: numberOrNull(attributes.battery_voltage),
    fuelLevel: numberOrNull(attributes.fuel_level),
    rpm: numberOrNull(attributes.rpm),
    coolantTemp: numberOrNull(attributes.coolant_temp),
    charging: booleanOrNull(attributes.charging ?? attributes.battery_charging),
    gsmSignalPercent: numberOrNull(attributes.gsm_signal_percent),
  };
  return Object.values(telemetry).some((value) => value != null) ? telemetry : null;
}

export function summarizeTelemetry(attributes?: Record<string, unknown>): string {
  const telemetry = extractTelemetry(attributes);
  if (!telemetry) return '';
  return [
    telemetry.ignition != null && `Ignition ${telemetry.ignition ? 'on' : 'off'}`,
    telemetry.batteryPercent != null && `${Math.round(telemetry.batteryPercent * 100)}% bat`,
    telemetry.batteryVoltage != null && `${telemetry.batteryVoltage.toFixed(1)}V`,
    telemetry.fuelLevel != null && `${Math.round(telemetry.fuelLevel)}% fuel`,
    telemetry.rpm != null && `${Math.round(telemetry.rpm)} rpm`,
    telemetry.coolantTemp != null && `${Math.round(telemetry.coolantTemp)}°C coolant`,
    telemetry.charging != null && (telemetry.charging ? 'charging' : 'not charging'),
    telemetry.gsmSignalPercent != null && `${Math.round(telemetry.gsmSignalPercent * 100)}% signal`,
  ]
    .filter(Boolean)
    .join(' · ');
}
