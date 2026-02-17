import { haversineKm } from './geo';

export interface PositionLike {
  latitude: number;
  longitude: number;
  speed?: number | null;
  timestamp: Date;
}

/** Cap for display (segment speed above this is not used for max speed). */
const MAX_SEGMENT_SPEED_KMH = 250;

/**
 * Segments with implied speed above this are treated as bad data (GPS glitch, interleaved
 * tracks, or duplicate streams). They are excluded from odometer and speed stats.
 * 120 km/h is a reasonable upper bound for road vehicles; avoids inflating distance from
 * alternating points from two devices or corrupted GPX.
 */
const MAX_REALISTIC_SPEED_KMH = 120;

/**
 * Compute odometer (km), max speed (km/h), and average speed (km/h) from positions.
 * Positions are sorted by timestamp ascending. Segment speed = distance/time; when
 * position.speed is present and valid it is used, else segment-derived speed.
 * Segments with implied speed > MAX_REALISTIC_SPEED_KMH are excluded (bad data).
 * Average speed = total distance / total time over included segments only.
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

  const sorted = [...positions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  if (pointCount === 1) {
    const s = sorted[0].speed ?? 0;
    const safe = Number.isFinite(s) && s >= 0 && s <= MAX_REALISTIC_SPEED_KMH ? s : 0;
    return { odometerKm: 0, maxSpeedKmh: safe, avgSpeedKmh: safe, pointCount: 1 };
  }

  let totalKm = 0;
  let totalTimeHours = 0;
  let maxSpeedKmh = 0;

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    const dtMs = b.timestamp.getTime() - a.timestamp.getTime();
    if (dtMs <= 0) continue;
    const dtHours = dtMs / (1000 * 3600);
    const segmentSpeedKmh = dtHours > 0 ? km / dtHours : 0;
    const useReported = b.speed != null && b.speed >= 0 && b.speed <= MAX_SEGMENT_SPEED_KMH;
    const speedKmh = useReported ? b.speed! : Math.min(segmentSpeedKmh, MAX_SEGMENT_SPEED_KMH);

    if (speedKmh > MAX_REALISTIC_SPEED_KMH) continue;

    totalKm += km;
    totalTimeHours += dtHours;
    if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;
  }

  const avgSpeedKmh =
    totalTimeHours > 0 && Number.isFinite(totalKm)
      ? totalKm / totalTimeHours
      : 0;
  const safeAvg = Number.isFinite(avgSpeedKmh) && avgSpeedKmh >= 0 ? avgSpeedKmh : 0;
  const safeMax = Number.isFinite(maxSpeedKmh) && maxSpeedKmh >= 0 ? maxSpeedKmh : 0;

  return {
    odometerKm: Math.round(totalKm * 1000) / 1000,
    maxSpeedKmh: Math.round(safeMax * 10) / 10,
    avgSpeedKmh: Math.round(safeAvg * 10) / 10,
    pointCount,
  };
}
