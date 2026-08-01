import type { Trip, TripPoint } from '../../domain/entities';

export type FusionPoint = TripPoint & { sourceTripId: string; sourceDeviceId: string | null; sourceLabel: string };
export type FusionEvaluation = { overlapMs: number; overlapPercent: number; matchedSamples: number; medianDistanceMeters: number | null; confidence: 'high' | 'medium' | 'low'; coverageGainPoints: number; warnings: string[] };
const MATCH_MS = 60000, DEDUPE_MS = 15000, DEDUPE_METERS = 50;

export function toFusionPoints(trip: Trip, points: TripPoint[]): FusionPoint[] {
  const label = trip.device?.name ?? trip.device?.imei ?? trip.name ?? 'Trip';
  return points.map((point) => ({ ...point, sourceTripId: trip.id, sourceDeviceId: trip.deviceId, sourceLabel: label }));
}

function meters(a: FusionPoint, b: FusionPoint) {
  const r = 6371000, dLat = (b.latitude - a.latitude) * Math.PI / 180, dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
function nearest(points: FusionPoint[], timestamp: Date) { return points.reduce<FusionPoint | null>((best, point) => Math.abs(point.timestamp.getTime() - timestamp.getTime()) <= MATCH_MS && (!best || Math.abs(point.timestamp.getTime() - timestamp.getTime()) < Math.abs(best.timestamp.getTime() - timestamp.getTime())) ? point : best, null); }
function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length ? sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 : null; }
function gain(primary: FusionPoint[], secondary: FusionPoint[], threshold: number) {
  if (!primary.length) return secondary.length;
  let count = secondary.filter((p) => primary[0].timestamp.getTime() - p.timestamp.getTime() > threshold || p.timestamp.getTime() - primary[primary.length - 1].timestamp.getTime() > threshold).length;
  for (let i = 1; i < primary.length; i++) if (primary[i].timestamp.getTime() - primary[i - 1].timestamp.getTime() > threshold) count += secondary.filter((p) => p.timestamp.getTime() > primary[i - 1].timestamp.getTime() + DEDUPE_MS && p.timestamp.getTime() < primary[i].timestamp.getTime() - DEDUPE_MS).length;
  return count;
}

export function evaluateFusionCandidate(source: Trip, candidate: Trip, sourcePoints: FusionPoint[], candidatePoints: FusionPoint[], threshold: number): FusionEvaluation {
  const start = Math.max(source.startTime.getTime(), candidate.startTime.getTime()), end = Math.min(source.endTime.getTime(), candidate.endTime.getTime());
  const overlapMs = Math.max(0, end - start), overlapPercent = Math.min(1, overlapMs / Math.max(1, source.endTime.getTime() - source.startTime.getTime()));
  const overlap = sourcePoints.filter((p) => p.timestamp.getTime() >= start && p.timestamp.getTime() <= end), step = Math.max(1, Math.ceil(overlap.length / 80));
  const distances: number[] = [];
  for (let i = 0; i < overlap.length; i += step) { const match = nearest(candidatePoints, overlap[i].timestamp); if (match) distances.push(meters(overlap[i], match)); }
  const medianDistanceMeters = median(distances), coverageGainPoints = gain(sourcePoints, candidatePoints, threshold), warnings: string[] = [];
  let confidence: FusionEvaluation['confidence'] = 'low';
  if (medianDistanceMeters != null && distances.length >= 3) confidence = medianDistanceMeters <= 300 && overlapPercent >= .1 ? 'high' : medianDistanceMeters <= 1000 ? 'medium' : 'low';
  else if (coverageGainPoints >= 10 && sourcePoints.length && candidatePoints.length && Math.min(meters(sourcePoints[sourcePoints.length - 1], candidatePoints[0]), meters(sourcePoints[0], candidatePoints[candidatePoints.length - 1])) <= 1000) confidence = 'medium';
  if (medianDistanceMeters != null && medianDistanceMeters > 1000) warnings.push('Overlapping points are far apart. This may be a different route.');
  if (!overlapMs) warnings.push('Trips do not overlap in time; only adjacent coverage can be checked.');
  if (!coverageGainPoints) warnings.push('The second trip does not fill a clear gap in the primary trip.');
  return { overlapMs, overlapPercent, matchedSamples: distances.length, medianDistanceMeters, confidence, coverageGainPoints, warnings };
}

export function fusePoints(primary: FusionPoint[], secondary: FusionPoint[], threshold: number): FusionPoint[] {
  if (!primary.length) return [...secondary].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const fillers = secondary.filter((p) => primary[0].timestamp.getTime() - p.timestamp.getTime() > threshold || p.timestamp.getTime() - primary[primary.length - 1].timestamp.getTime() > threshold);
  for (let i = 1; i < primary.length; i++) if (primary[i].timestamp.getTime() - primary[i - 1].timestamp.getTime() > threshold) fillers.push(...secondary.filter((p) => p.timestamp.getTime() > primary[i - 1].timestamp.getTime() + DEDUPE_MS && p.timestamp.getTime() < primary[i].timestamp.getTime() - DEDUPE_MS));
  const result = [...primary].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const point of fillers.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) if (!result.some((p) => Math.abs(p.timestamp.getTime() - point.timestamp.getTime()) <= DEDUPE_MS && meters(p, point) <= DEDUPE_METERS)) result.push(point);
  return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
