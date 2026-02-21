/**
 * Time breakdown for trips: driving vs stopped segments.
 */

/** Haversine distance in km (for stop detection) */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface PositionLike {
  latitude: number;
  longitude: number;
  timestamp: string | Date;
}

export interface StopLike {
  startMs: number;
  endMs?: number;
  label?: string;
}

export interface TimeSegment {
  type: 'driving' | 'stop';
  label: string;
  durationMs: number;
  /** For stops: optional label (e.g. "Lunch", "Fuel") */
  stopLabel?: string;
}

/** A detected stop (from position data) for display in location records */
export interface DetectedStopForDisplay {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
  latitude: number;
  longitude: number;
}

export interface TimeBreakdown {
  totalMs: number;
  drivingMs: number;
  stoppedMs: number;
  segments: TimeSegment[];
  /** Detected stops (from positions) for location records; empty when using explicit stops */
  detectedStopsForDisplay: DetectedStopForDisplay[];
}

/** Min distance (km) to consider "moved" from a stop. ~50m */
const STOP_MOVE_THRESHOLD_KM = 0.05;

/** Min stationary time (ms) to count as a stop. 2 min */
const MIN_STOP_DURATION_MS = 2 * 60 * 1000;

/**
 * Detect implicit stops from position data: consecutive points within threshold for min duration.
 */
function detectStopsFromPositions(
  positions: PositionLike[],
  startMs: number,
  endMs: number
): Array<{ startMs: number; endMs: number; latitude: number; longitude: number }> {
  const sorted = [...positions]
    .filter((p) => {
      const t = typeof p.timestamp === 'string' ? new Date(p.timestamp).getTime() : p.timestamp.getTime();
      return t >= startMs && t <= endMs;
    })
    .sort(
      (a, b) =>
        (typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp.getTime()) -
        (typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp.getTime())
    );
  const stops: Array<{ startMs: number; endMs: number; latitude: number; longitude: number }> = [];
  let i = 0;
  while (i < sorted.length - 1) {
    const p0 = sorted[i]!;
    const t0 = typeof p0.timestamp === 'string' ? new Date(p0.timestamp).getTime() : p0.timestamp.getTime();
    let j = i + 1;
    while (j < sorted.length) {
      const pj = sorted[j]!;
      const km = haversineKm(p0.latitude, p0.longitude, pj.latitude, pj.longitude);
      if (km > STOP_MOVE_THRESHOLD_KM) break;
      j++;
    }
    const lastIdx = j - 1;
    if (lastIdx > i) {
      const plast = sorted[lastIdx]!;
      const tEnd = typeof plast.timestamp === 'string' ? new Date(plast.timestamp).getTime() : plast.timestamp.getTime();
      const duration = tEnd - t0;
      if (duration >= MIN_STOP_DURATION_MS) {
        stops.push({ startMs: t0, endMs: tEnd, latitude: p0.latitude, longitude: p0.longitude });
      }
    }
    i = j;
  }
  return stops;
}

/**
 * Compute time breakdown from trip bounds and optional stops.
 * If no explicit stops but positions provided, detects implicit stops from stationary periods.
 */
export function computeTimeBreakdown(
  startMs: number,
  endMs: number,
  options?: {
    explicitStops?: StopLike[];
    positions?: PositionLike[];
    /** Exclude detected stops by id (e.g. when user hides them); id = `${startMs}-${endMs}` */
    excludeDetectedStopIds?: string[];
  }
): TimeBreakdown {
  const totalMs = Math.max(0, endMs - startMs);
  const segments: TimeSegment[] = [];

  let stops: Array<{ startMs: number; endMs: number; label?: string }> = [];

  if (options?.explicitStops?.length) {
    stops = options.explicitStops
      .filter((s) => s.startMs >= startMs && s.startMs <= endMs)
      .map((s) => ({
        startMs: s.startMs,
        endMs: s.endMs ?? s.startMs,
        label: s.label,
      }))
      .sort((a, b) => a.startMs - b.startMs);
  } else if (options?.positions?.length) {
    const detected = detectStopsFromPositions(options.positions, startMs, endMs);
    const exclude = new Set(options.excludeDetectedStopIds ?? []);
    const filtered = detected.filter((s) => !exclude.has(`${s.startMs}-${s.endMs}`));
    stops = filtered.map((s) => ({ startMs: s.startMs, endMs: s.endMs }));
  }

  let detectedStopsForDisplay: DetectedStopForDisplay[] = [];
  if (options?.positions?.length && !options?.explicitStops?.length) {
    const detected = detectStopsFromPositions(options.positions, startMs, endMs);
    const exclude = new Set(options.excludeDetectedStopIds ?? []);
    detectedStopsForDisplay = detected
      .filter((s) => !exclude.has(`${s.startMs}-${s.endMs}`))
      .map((s, i) => ({
        id: `${s.startMs}-${s.endMs}`,
        startMs: s.startMs,
        endMs: s.endMs,
        label: `Stop ${i + 1}`,
        latitude: s.latitude,
        longitude: s.longitude,
      }));
  }

  if (stops.length === 0) {
    segments.push({ type: 'driving', label: 'Driving', durationMs: totalMs });
    return {
      totalMs,
      drivingMs: totalMs,
      stoppedMs: 0,
      segments,
      detectedStopsForDisplay,
    };
  }

  let drivingMs = 0;
  let stoppedMs = 0;

  // Start → first stop
  const firstStop = stops[0]!;
  const driveToFirst = Math.max(0, firstStop.startMs - startMs);
  if (driveToFirst > 0) {
    segments.push({ type: 'driving', label: 'Start → first stop', durationMs: driveToFirst });
    drivingMs += driveToFirst;
  }

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]!;
    const stopDuration = Math.max(0, stop.endMs - stop.startMs);
    if (stopDuration > 0) {
      const label = stop.label ? stop.label : `Stop ${i + 1}`;
      segments.push({ type: 'stop', label, durationMs: stopDuration, stopLabel: stop.label });
      stoppedMs += stopDuration;
    }

    const nextStop = stops[i + 1];
    if (nextStop) {
      const driveToNext = Math.max(0, nextStop.startMs - stop.endMs);
      if (driveToNext > 0) {
        segments.push({
          type: 'driving',
          label: `${stop.label || `Stop ${i + 1}`} → ${nextStop.label || `Stop ${i + 2}`}`,
          durationMs: driveToNext,
        });
        drivingMs += driveToNext;
      }
    } else {
      const driveToEnd = Math.max(0, endMs - stop.endMs);
      if (driveToEnd > 0) {
        segments.push({
          type: 'driving',
          label: `${stop.label || `Stop ${i + 1}`} → End`,
          durationMs: driveToEnd,
        });
        drivingMs += driveToEnd;
      }
    }
  }

  return {
    totalMs,
    drivingMs,
    stoppedMs,
    segments,
    detectedStopsForDisplay,
  };
}
