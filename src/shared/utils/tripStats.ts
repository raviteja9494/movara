import { haversineKm } from './geo';

export interface PositionLike {
  latitude: number;
  longitude: number;
  speed?: number | null;
  timestamp: Date;
}

/**
 * Compute odometer (km), max speed (km/h), and average speed (km/h) from
 * positions ordered by timestamp ascending. Segment speed used when position.speed is missing.
 */
export function computeTripStats(positions: PositionLike[]): {
  odometerKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  pointCount: number;
} {
  const pointCount = positions.length;
  if (pointCount === 0) {
    return { odometerKm: 0, maxSpeedKmh: 0, avgSpeedKmh: 0, pointCount: 0 };
  }
  if (pointCount === 1) {
    const s = positions[0].speed ?? 0;
    return { odometerKm: 0, maxSpeedKmh: s, avgSpeedKmh: s, pointCount: 1 };
  }

  let totalKm = 0;
  let totalTimeHours = 0;
  let maxSpeedKmh = 0;
  let segmentSpeeds: number[] = [];

  for (let i = 1; i < positions.length; i++) {
    const a = positions[i - 1];
    const b = positions[i];
    const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    totalKm += km;
    const dtMs = b.timestamp.getTime() - a.timestamp.getTime();
    if (dtMs <= 0) continue;
    const dtHours = dtMs / (1000 * 3600);
    totalTimeHours += dtHours;
    const segmentSpeedKmh = dtHours > 0 ? km / dtHours : 0;
    const speedKmh = b.speed != null && b.speed >= 0 ? b.speed : segmentSpeedKmh;
    segmentSpeeds.push(speedKmh);
    if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;
  }

  const avgSpeedKmh =
    segmentSpeeds.length > 0
      ? segmentSpeeds.reduce((s, v) => s + v, 0) / segmentSpeeds.length
      : 0;
  const odometerAvg = totalTimeHours > 0 ? totalKm / totalTimeHours : 0;
  const avgSpeedKmhFinal =
    segmentSpeeds.length > 0 ? avgSpeedKmh : (positions[0].speed ?? odometerAvg);

  return {
    odometerKm: Math.round(totalKm * 1000) / 1000,
    maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
    avgSpeedKmh: Math.round(avgSpeedKmhFinal * 10) / 10,
    pointCount,
  };
}
