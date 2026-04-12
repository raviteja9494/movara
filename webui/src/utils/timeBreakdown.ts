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

export interface SupplementalStopLike extends StopLike {
  id?: string;
  latitude?: number;
  longitude?: number;
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

export interface AutoStopThresholds {
  moveThresholdKm?: number;
  minStopDurationMs?: number;
  minStopPoints?: number;
}

/**
 * Detect implicit stops from position data: consecutive points within threshold for min duration.
 */
function detectStopsFromPositions(
  positions: PositionLike[],
  startMs: number,
  endMs: number,
  thresholds?: AutoStopThresholds,
): Array<{ startMs: number; endMs: number; latitude: number; longitude: number }> {
  const stopMoveThresholdKm = thresholds?.moveThresholdKm ?? 0.06;
  const minStopDurationMs = thresholds?.minStopDurationMs ?? 3 * 60 * 1000;
  const minStopPoints = thresholds?.minStopPoints ?? 3;
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
  let clusterStart = 0;

  const finalizeCluster = (startIdx: number, endIdx: number) => {
    if (endIdx - startIdx + 1 < minStopPoints) return;
    const start = sorted[startIdx]!;
    const end = sorted[endIdx]!;
    const startTime = typeof start.timestamp === 'string' ? new Date(start.timestamp).getTime() : start.timestamp.getTime();
    const endTime = typeof end.timestamp === 'string' ? new Date(end.timestamp).getTime() : end.timestamp.getTime();
    const duration = endTime - startTime;
    if (duration < minStopDurationMs) return;

    let latSum = 0;
    let lonSum = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      latSum += sorted[i]!.latitude;
      lonSum += sorted[i]!.longitude;
    }
    const pointCount = endIdx - startIdx + 1;
    stops.push({
      startMs: startTime,
      endMs: endTime,
      latitude: latSum / pointCount,
      longitude: lonSum / pointCount,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const current = sorted[i]!;
    const prevToCurrentKm = haversineKm(prev.latitude, prev.longitude, current.latitude, current.longitude);

    let centroidLat = 0;
    let centroidLon = 0;
    const clusterCount = i - clusterStart;
    for (let j = clusterStart; j < i; j++) {
      centroidLat += sorted[j]!.latitude;
      centroidLon += sorted[j]!.longitude;
    }
    centroidLat /= Math.max(clusterCount, 1);
    centroidLon /= Math.max(clusterCount, 1);

    const currentToCentroidKm = haversineKm(centroidLat, centroidLon, current.latitude, current.longitude);
    const staysInCluster =
      prevToCurrentKm <= stopMoveThresholdKm &&
      currentToCentroidKm <= stopMoveThresholdKm;

    if (!staysInCluster) {
      finalizeCluster(clusterStart, i - 1);
      clusterStart = i;
    }
  }

  finalizeCluster(clusterStart, sorted.length - 1);
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
    supplementalStops?: SupplementalStopLike[];
    /** Exclude detected stops by id (e.g. when user hides them); id = `${startMs}-${endMs}` */
    excludeDetectedStopIds?: string[];
    thresholds?: AutoStopThresholds;
  }
): TimeBreakdown {
  const totalMs = Math.max(0, endMs - startMs);
  const segments: TimeSegment[] = [];

  let stops: Array<{ startMs: number; endMs: number; label?: string }> = [];

  const normalizedSupplementalStops = (options?.supplementalStops ?? [])
    .filter((s) => s.startMs <= endMs && (s.endMs ?? s.startMs) >= startMs)
    .map((s) => ({
      id: s.id ?? `${Math.max(s.startMs, startMs)}-${Math.max(Math.min(s.endMs ?? s.startMs, endMs), Math.max(s.startMs, startMs))}`,
      startMs: Math.max(s.startMs, startMs),
      endMs: Math.max(Math.min(s.endMs ?? s.startMs, endMs), Math.max(s.startMs, startMs)),
      label: s.label,
      latitude: s.latitude,
      longitude: s.longitude,
    }));

  if (options?.explicitStops?.length) {
    stops = options.explicitStops
      .filter((s) => s.startMs <= endMs && (s.endMs ?? s.startMs) >= startMs)
      .map((s) => ({
        startMs: Math.max(s.startMs, startMs),
        endMs: Math.max(Math.min(s.endMs ?? s.startMs, endMs), Math.max(s.startMs, startMs)),
        label: s.label,
      }))
      .concat(normalizedSupplementalStops.map((s) => ({
        startMs: s.startMs,
        endMs: s.endMs,
        label: s.label,
      })))
      .sort((a, b) => a.startMs - b.startMs);
  } else if (options?.positions?.length) {
    const detected = detectStopsFromPositions(options.positions, startMs, endMs, options.thresholds);
    const exclude = new Set(options.excludeDetectedStopIds ?? []);
    const filtered = detected.filter((s) => !exclude.has(`${s.startMs}-${s.endMs}`));
    stops = filtered
      .map((s) => ({ startMs: s.startMs, endMs: s.endMs }))
      .concat(normalizedSupplementalStops
        .filter((s) => !exclude.has(s.id))
        .map((s) => ({ startMs: s.startMs, endMs: s.endMs, label: s.label })))
      .sort((a, b) => a.startMs - b.startMs);
  } else if (normalizedSupplementalStops.length > 0) {
    stops = normalizedSupplementalStops
      .filter((s) => !exclude.has(s.id))
      .map((s) => ({ startMs: s.startMs, endMs: s.endMs, label: s.label }))
      .sort((a, b) => a.startMs - b.startMs);
  }

  let detectedStopsForDisplay: DetectedStopForDisplay[] = [];
  const exclude = new Set(options?.excludeDetectedStopIds ?? []);
  const hasExplicitStops = Boolean(options?.explicitStops?.length);
  if (options?.positions?.length && !hasExplicitStops) {
    const detected = detectStopsFromPositions(options.positions, startMs, endMs, options.thresholds);
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
  if (normalizedSupplementalStops.length > 0) {
    const supplementalDisplayStops = normalizedSupplementalStops
      .filter((s) => !exclude.has(s.id) && typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map((s, index) => ({
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        label: s.label || `Stop ${index + 1}`,
        latitude: s.latitude!,
        longitude: s.longitude!,
      }));
    detectedStopsForDisplay = detectedStopsForDisplay
      .concat(supplementalDisplayStops)
      .sort((a, b) => a.startMs - b.startMs);
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
