import type { TripDetailPosition } from '../api/trips';

export interface AddedStop {
  id: string;
  timestamp: string;
  endTimestamp?: string;
  latitude: number;
  longitude: number;
  label: string;
}

export interface TripTimelineEvent {
  id: string;
  type: 'start' | 'moving' | 'stop' | 'parked';
  title: string;
  dateTime: string;
  timestampMs: number;
  detail?: string;
  badge?: string;
  badgeClassName?: string;
}

export interface StopTimelineSource {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  detail?: string;
}

export interface MatchedTripLocation {
  id: string;
  locationId: string;
  name: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  timestampMs: number;
  relationLabel: string;
  relationType: 'start' | 'stop' | 'parked';
}

export interface BookmarkDraft {
  latitude: number;
  longitude: number;
  name: string;
  notes: string;
}

export const BOOKMARK_MATCH_RADIUS_M = 220;

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatCompactDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatMeters(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return 'No overlap';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function buildGpx(positions: TripDetailPosition[], trackName: string): string {
  const trkpts = positions
    .map(
      (p) =>
        `    <trkpt lat="${p.latitude}" lon="${p.longitude}"><time>${p.timestamp}</time>${p.speed != null ? `<extensions><speed>${p.speed}</speed></extensions>` : ''}</trkpt>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Movara" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${trackName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}
