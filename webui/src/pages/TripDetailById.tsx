import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { createSavedLocation, fetchSavedLocations, type SavedLocation } from '../api/locations';
import { fetchRuntimeSettings, type RuntimeSettings } from '../api/system';
import { fetchTrip, updateTrip, splitTrip, addTripStop, updateTripStop, deleteTripStop, type TripDetailResponse, type TripDetailPosition } from '../api/trips';
import { fetchFuelRecords, type FuelRecord } from '../api/vehicles';
import { TrackMap, type MapBookmark, type MapStop } from '../components/TrackMap';
import { SpeedChart } from '../components/SpeedChart';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance, formatSpeed, formatDurationMs } from '../utils/units';
import { computeTimeBreakdown } from '../utils/timeBreakdown';
import { getErrorMessage } from '../utils/getErrorMessage';
import { extractTelemetry } from '../utils/telemetry';
import { formatIsoForDatetimeLocal, parseDatetimeLocal } from '../utils/datetimeLocal';

interface AddedStop {
  id: string;
  timestamp: string;
  endTimestamp?: string;
  latitude: number;
  longitude: number;
  label: string;
}

interface TripTimelineEvent {
  id: string;
  type: 'start' | 'moving' | 'stop' | 'parked';
  title: string;
  dateTime: string;
  timestampMs: number;
  detail?: string;
  badge?: string;
  badgeClassName?: string;
}

interface StopTimelineSource {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  detail?: string;
}

interface MatchedTripLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  timestampMs: number;
  relationLabel: string;
  relationType: 'start' | 'stop' | 'parked';
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDateTime(iso: string): string {
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

function buildGpx(positions: TripDetailPosition[], trackName: string): string {
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

function downloadGpx(positions: TripDetailPosition[], trackName: string, tripId: string): void {
  const gpx = buildGpx(positions, trackName);
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trip-${tripId}-${Date.now()}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TripDetailById() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const [data, setData] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitAt, setSplitAt] = useState('');
  const [addStopModalOpen, setAddStopModalOpen] = useState(false);
  const [addStopTime, setAddStopTime] = useState('');
  const [addStopEndTime, setAddStopEndTime] = useState('');
  const [addStopName, setAddStopName] = useState('');
  /** When set, add-stop was opened from map click; use these coords instead of nearest-by-time */
  const [addStopFromMap, setAddStopFromMap] = useState<{ lat: number; lon: number } | null>(null);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editingStopLabel, setEditingStopLabel] = useState('');
  const [hiddenDetectedStopIds, setHiddenDetectedStopIds] = useState<Set<string>>(() => new Set());
  const [renamedDetectedStops, setRenamedDetectedStops] = useState<Record<string, string>>({});
  const [editingDetectedStopId, setEditingDetectedStopId] = useState<string | null>(null);
  const [editingDetectedStopLabel, setEditingDetectedStopLabel] = useState('');
  const [editTimesModalOpen, setEditTimesModalOpen] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [tripMapMode, setTripMapMode] = useState<'none' | 'stop' | 'bookmark'>('none');
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings | null>(null);

  const addedStops: AddedStop[] = useMemo(() => {
    const stops = data?.stops ?? [];
    return stops.map((s) => ({
      id: s.id,
      timestamp: s.startTime,
      endTimestamp: s.endTime ?? undefined,
      latitude: s.latitude,
      longitude: s.longitude,
      label: s.label,
    }));
  }, [data?.stops]);

  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    setError(null);
    fetchTrip(tripId)
      .then(setData)
      .catch((e) => setError(getErrorMessage(e, 'Failed to load trip')))
      .finally(() => setLoading(false));
  }, [tripId]);

  useEffect(() => {
    fetchRuntimeSettings()
      .then((res) => setRuntimeSettings(res.settings))
      .catch(() => setRuntimeSettings(null));
  }, []);

  useEffect(() => {
    fetchSavedLocations()
      .then((res) => setSavedLocations(res.locations))
      .catch(() => setSavedLocations([]));
  }, []);

  useEffect(() => {
    if (!data?.trip?.vehicleId) {
      setFuelRecords([]);
      return;
    }
    fetchFuelRecords(data.trip.vehicleId)
      .then((r) => setFuelRecords(r.fuelRecords || []))
      .catch(() => setFuelRecords([]));
  }, [data?.trip?.vehicleId]);

  const mapPoints = useMemo(() => {
    if (!data?.positions?.length) return [];
    const sorted = [...data.positions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return sorted.map((p) => ({
        lat: p.latitude,
        lon: p.longitude,
        time: formatDateTime(p.timestamp),
        timestamp: p.timestamp,
        label: undefined,
      }));
  }, [data?.positions]);

  const durationMs = useMemo(() => {
    if (!data?.trip) return 0;
    if (data.positions?.length >= 2) {
      const sorted = [...data.positions].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const first = new Date(sorted[0].timestamp).getTime();
      const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
      return Math.max(0, last - first);
    }
    const start = new Date(data.trip.startTime).getTime();
    const end = new Date(data.trip.endTime).getTime();
    return Math.max(0, end - start);
  }, [data?.trip, data?.positions]);

  const positionsForChart = useMemo(() => {
    if (!data?.positions?.length) return [];
    return data.positions.map((p) => ({
      id: p.timestamp,
      deviceId: data.trip.deviceId ?? '',
      timestamp: p.timestamp,
      latitude: p.latitude,
      longitude: p.longitude,
      speed: p.speed,
      createdAt: p.timestamp,
      attributes: p.attributes,
    }));
  }, [data?.positions, data?.trip?.deviceId]);
  const latestTelemetry = useMemo(() => {
    const latest = data?.positions?.[data.positions.length - 1];
    return latest ? extractTelemetry(latest.attributes) : null;
  }, [data?.positions]);

  const tripStartMs = data?.trip ? new Date(data.trip.startTime).getTime() : 0;
  const tripEndMs = data?.trip ? new Date(data.trip.endTime).getTime() : 0;
  /** Use same bounds as durationMs so breakdown (driving + stopped) matches displayed travel time */
  const breakdownStartMs = useMemo(() => {
    if (!data?.positions?.length) return tripStartMs;
    const sorted = [...data.positions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return new Date(sorted[0].timestamp).getTime();
  }, [data?.positions, tripStartMs]);
  const breakdownEndMs = useMemo(() => {
    if (!data?.positions?.length) return tripEndMs;
    const sorted = [...data.positions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return new Date(sorted[sorted.length - 1].timestamp).getTime();
  }, [data?.positions, tripEndMs]);
  const timeBreakdown = useMemo(() => {
    if (!breakdownStartMs || !breakdownEndMs) return null;
    const explicitStops = addedStops.map((s) => ({
      startMs: new Date(s.timestamp).getTime(),
      endMs: s.endTimestamp ? new Date(s.endTimestamp).getTime() : undefined,
      label: s.label,
    }));
    const positions = data?.positions?.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: p.timestamp,
    }));
    const thresholds =
      runtimeSettings != null
        ? {
            minStopDurationMs: runtimeSettings.autoStopMinDurationMinutes * 60 * 1000,
            moveThresholdKm: runtimeSettings.autoStopMoveThresholdMeters / 1000,
            minStopPoints: runtimeSettings.autoStopMinPoints,
          }
        : undefined;
    return computeTimeBreakdown(breakdownStartMs, breakdownEndMs, {
      explicitStops: explicitStops.length > 0 ? explicitStops : undefined,
      positions: explicitStops.length === 0 ? positions : undefined,
      excludeDetectedStopIds: hiddenDetectedStopIds.size > 0 ? Array.from(hiddenDetectedStopIds) : undefined,
      thresholds,
    });
  }, [breakdownStartMs, breakdownEndMs, addedStops, data?.positions, hiddenDetectedStopIds, runtimeSettings]);
  const fuelStopsInTrip = useMemo(() => {
    if (!data?.trip || !fuelRecords.length) return [];
    return fuelRecords.filter((f) => {
      if (f.latitude == null || f.longitude == null) return false;
      const t = new Date(f.date).getTime();
      return t >= tripStartMs && t <= tripEndMs;
    });
  }, [data?.trip, fuelRecords, tripStartMs, tripEndMs]);
  const matchedTripLocations = useMemo<MatchedTripLocation[]>(() => {
    if (!data?.trip || savedLocations.length === 0) return [];

    const candidates: Array<{
      lat: number;
      lon: number;
      timestampMs: number;
      relationLabel: string;
      relationType: 'start' | 'stop' | 'parked';
    }> = [];

    const startPos = data.positions?.[0];
    const endPos = data.positions?.[data.positions.length - 1];
    if (startPos) {
      candidates.push({
        lat: startPos.latitude,
        lon: startPos.longitude,
        timestampMs: new Date(startPos.timestamp).getTime(),
        relationLabel: 'Trip started near',
        relationType: 'start',
      });
    }
    if (endPos) {
      candidates.push({
        lat: endPos.latitude,
        lon: endPos.longitude,
        timestampMs: new Date(endPos.timestamp).getTime(),
        relationLabel: latestTelemetry?.ignition === false ? 'Parked near' : 'Trip ended near',
        relationType: 'parked',
      });
    }
    fuelStopsInTrip.forEach((stop) => {
      candidates.push({
        lat: stop.latitude!,
        lon: stop.longitude!,
        timestampMs: new Date(stop.date).getTime(),
        relationLabel: 'Fuel stop near',
        relationType: 'stop',
      });
    });
    addedStops.forEach((stop) => {
      candidates.push({
        lat: stop.latitude,
        lon: stop.longitude,
        timestampMs: new Date(stop.timestamp).getTime(),
        relationLabel: `${stop.label || 'Stop'} near`,
        relationType: 'stop',
      });
    });
    (timeBreakdown?.detectedStopsForDisplay ?? []).forEach((stop) => {
      candidates.push({
        lat: stop.latitude,
        lon: stop.longitude,
        timestampMs: stop.startMs,
        relationLabel: `${renamedDetectedStops[stop.id] ?? stop.label} near`,
        relationType: 'stop',
      });
    });

    const seen = new Set<string>();
    return candidates
      .flatMap((candidate) =>
        savedLocations
          .filter((location) => haversineMeters(candidate.lat, candidate.lon, location.latitude, location.longitude) <= 120)
          .map((location) => ({
            id: `${candidate.relationType}-${candidate.timestampMs}-${location.id}`,
            name: location.name,
            latitude: location.latitude,
            longitude: location.longitude,
            notes: location.notes,
            timestampMs: candidate.timestampMs,
            relationLabel: candidate.relationLabel,
            relationType: candidate.relationType,
          })),
      )
      .filter((match) => {
        const key = `${match.relationType}-${match.name}-${Math.round(match.timestampMs / 60000)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [addedStops, data?.positions, data?.trip, fuelStopsInTrip, latestTelemetry?.ignition, renamedDetectedStops, savedLocations, timeBreakdown?.detectedStopsForDisplay]);
  const tripTimelineEvents = useMemo<TripTimelineEvent[]>(() => {
    if (!data?.trip) return [];

    const sortedPositions = [...(data.positions ?? [])].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const events: TripTimelineEvent[] = [];
    const startMs = new Date(data.trip.startTime).getTime();
    events.push({
      id: 'trip-start',
      type: 'start',
      title: 'Trip started',
      dateTime: formatDateTime(data.trip.startTime),
      timestampMs: startMs,
      detail: data.trip.vehicle?.name ?? data.trip.device?.name ?? data.trip.device?.imei ?? undefined,
      badge: 'Trip',
      badgeClassName: 'trip-stop-chip--manual',
    });

    const firstMovingPosition = sortedPositions.find((position) => (position.speed ?? 0) > 3);
    if (firstMovingPosition) {
      events.push({
        id: 'first-moving',
        type: 'moving',
        title: 'Vehicle moving',
        dateTime: formatDateTime(firstMovingPosition.timestamp),
        timestampMs: new Date(firstMovingPosition.timestamp).getTime(),
        detail: firstMovingPosition.speed != null ? `${Math.round(firstMovingPosition.speed)} km/h` : undefined,
        badge: 'Move',
        badgeClassName: 'trip-stop-chip--duration',
      });
    }

    const stopSources: StopTimelineSource[] = [];
    fuelStopsInTrip.forEach((fuelStop) => {
      const stopAt = new Date(fuelStop.date).getTime();
      stopSources.push({
        id: `fuel-${fuelStop.id}`,
        title: 'Fuel stop',
        startMs: stopAt,
        endMs: stopAt,
      });
    });
    addedStops.forEach((stop) => {
      const start = new Date(stop.timestamp).getTime();
      const end = stop.endTimestamp ? new Date(stop.endTimestamp).getTime() : start;
      stopSources.push({
        id: `manual-${stop.id}`,
        title: stop.label || 'Stop',
        startMs: start,
        endMs: end > start ? end : start,
        detail: end > start ? formatDurationMs(end - start) : undefined,
      });
    });
    (timeBreakdown?.detectedStopsForDisplay ?? []).forEach((stop) => {
      stopSources.push({
        id: `detected-${stop.id}`,
        title: renamedDetectedStops[stop.id] ?? stop.label,
        startMs: stop.startMs,
        endMs: stop.endMs,
        detail: stop.endMs > stop.startMs ? formatDurationMs(stop.endMs - stop.startMs) : undefined,
      });
    });

    const dedupedStopSources = stopSources
      .sort((a, b) => a.startMs - b.startMs)
      .filter((event, index, all) => index === 0 || Math.abs(event.startMs - all[index - 1].startMs) > 60_000);

    dedupedStopSources.forEach((stopEvent) => {
      events.push({
        id: stopEvent.id,
        type: 'stop',
        title: stopEvent.title,
        dateTime: formatDateTime(new Date(stopEvent.startMs).toISOString()),
        timestampMs: stopEvent.startMs,
        detail: stopEvent.detail,
        badge: 'Stop',
        badgeClassName: 'trip-stop-chip--detected',
      });

      const nextMovingPosition = sortedPositions.find(
        (position) =>
          new Date(position.timestamp).getTime() > stopEvent.endMs &&
          (position.speed ?? 0) > 3,
      );

      if (nextMovingPosition) {
        const resumeMs = new Date(nextMovingPosition.timestamp).getTime();
        const previousEventMs = events[events.length - 1]?.timestampMs ?? 0;
        if (resumeMs - previousEventMs > 60_000) {
          events.push({
            id: `${stopEvent.id}-resume`,
            type: 'moving',
            title: 'Resumed moving',
            dateTime: formatDateTime(nextMovingPosition.timestamp),
            timestampMs: resumeMs,
            detail: nextMovingPosition.speed != null ? `${Math.round(nextMovingPosition.speed)} km/h` : undefined,
            badge: 'Move',
            badgeClassName: 'trip-stop-chip--duration',
          });
        }
      }
    });

    matchedTripLocations.forEach((location) => {
      events.push({
        id: `bookmark-${location.id}`,
        type: location.relationType,
        title: `${location.relationLabel} ${location.name}`,
        dateTime: formatDateTime(new Date(location.timestampMs).toISOString()),
        timestampMs: location.timestampMs,
        detail: location.notes ?? undefined,
        badge: 'Bookmark',
        badgeClassName: 'trip-stop-chip--bookmark',
      });
    });

    events.push({
      id: 'trip-end',
      type: 'parked',
      title: latestTelemetry?.ignition === false ? 'Parked / ignition off' : 'Trip ended',
      dateTime: formatDateTime(data.trip.endTime),
      timestampMs: new Date(data.trip.endTime).getTime(),
      badge: latestTelemetry?.ignition === false ? 'Parked' : 'Trip',
      badgeClassName: latestTelemetry?.ignition === false ? 'trip-stop-chip--fuel' : 'trip-stop-chip--manual',
    });

    return events.sort((a, b) => a.timestampMs - b.timestampMs);
  }, [data?.trip, data?.positions, fuelStopsInTrip, addedStops, timeBreakdown?.detectedStopsForDisplay, renamedDetectedStops, latestTelemetry, matchedTripLocations]);

  const mapStops = useMemo((): MapStop[] => {
    const stops: MapStop[] = fuelStopsInTrip.map((f) => ({
      lat: f.latitude!,
      lon: f.longitude!,
      label: `Fuel · ${formatDateTime(f.date)}`,
    }));
    addedStops.forEach((s) => stops.push({ lat: s.latitude, lon: s.longitude, label: s.label }));
    (timeBreakdown?.detectedStopsForDisplay ?? []).forEach((s) =>
      stops.push({ lat: s.latitude, lon: s.longitude, label: renamedDetectedStops[s.id] ?? s.label })
    );
    return stops;
  }, [fuelStopsInTrip, addedStops, timeBreakdown?.detectedStopsForDisplay, renamedDetectedStops]);
  const mapBookmarks = useMemo<MapBookmark[]>(
    () =>
      matchedTripLocations.map((location) => ({
        lat: location.latitude,
        lon: location.longitude,
        label: location.name,
        notes: location.notes ?? `${location.relationLabel} ${location.name}`,
      })),
    [matchedTripLocations],
  );

  const locationRecords = useMemo(() => {
    type Rec = {
      type: string;
      dateTime: string;
      lat?: number;
      lon?: number;
      label?: string;
      stopId?: string;
      isDetectedStop?: boolean;
      stopSource?: 'fuel' | 'manual' | 'detected';
      durationMs?: number;
    };
    const records: Rec[] = [];
    if (!data?.trip) return records;
    const { trip, positions } = data;
    const hasMultiplePositions = (positions?.length ?? 0) >= 2;
    const startPos = positions?.length ? positions[0] : null;
    records.push({
      type: 'start',
      dateTime: formatDateTime(hasMultiplePositions && startPos ? startPos.timestamp : trip.startTime),
      lat: startPos?.latitude,
      lon: startPos?.longitude,
    });
    const allStops: Array<{ time: number; rec: Rec }> = [
      ...fuelStopsInTrip.map((f) => ({
        time: new Date(f.date).getTime(),
        rec: {
          type: 'stop',
          dateTime: formatDateTime(f.date),
          lat: f.latitude!,
          lon: f.longitude!,
          label: `Fuel · ${formatDateTime(f.date)}`,
          stopId: f.id,
          isDetectedStop: false,
          stopSource: 'fuel' as const,
        },
      })),
      ...addedStops.map((s) => ({
        time: new Date(s.timestamp).getTime(),
        rec: {
          type: 'stop',
          dateTime: s.endTimestamp
            ? `${formatDateTime(s.timestamp)} – ${formatDateTime(s.endTimestamp)}`
            : formatDateTime(s.timestamp),
          lat: s.latitude,
          lon: s.longitude,
          label: s.label,
          stopId: s.id,
          isDetectedStop: false,
          stopSource: 'manual' as const,
          durationMs: s.endTimestamp
            ? Math.max(0, new Date(s.endTimestamp).getTime() - new Date(s.timestamp).getTime())
            : undefined,
        },
      })),
      ...(timeBreakdown?.detectedStopsForDisplay ?? []).map((s) => {
        const dateTimeStr =
          s.startMs !== s.endMs
            ? `${formatDateTime(new Date(s.startMs).toISOString())} – ${formatDateTime(new Date(s.endMs).toISOString())}`
            : formatDateTime(new Date(s.startMs).toISOString());
        return {
          time: s.startMs,
          rec: {
            type: 'stop',
            dateTime: dateTimeStr,
            lat: s.latitude,
            lon: s.longitude,
            label: renamedDetectedStops[s.id] ?? s.label,
            stopId: s.id,
            isDetectedStop: true,
            stopSource: 'detected' as const,
            durationMs: Math.max(0, s.endMs - s.startMs),
          },
        };
      }),
    ];
    allStops.sort((a, b) => a.time - b.time).forEach(({ rec }) => records.push(rec));
    const endPos = positions?.length ? positions[positions.length - 1] : null;
    records.push({
      type: 'end',
      dateTime: formatDateTime(hasMultiplePositions && endPos ? endPos.timestamp : trip.endTime),
      lat: endPos?.latitude,
      lon: endPos?.longitude,
    });
    return records;
  }, [data?.positions, data?.trip, fuelStopsInTrip, addedStops, timeBreakdown?.detectedStopsForDisplay, renamedDetectedStops]);

  const handleRenameSave = () => {
    if (!tripId) return;
    const name = renameInput.trim() || null;
    updateTrip(tripId, { name })
      .then((r) => {
        setData((prev) => (prev ? { ...prev, trip: r.trip } : null));
        setRenameModalOpen(false);
        setShowActionsMenu(false);
      })
      .catch(() => {});
  };

  const handleSplit = () => {
    if (!tripId || !splitAt) return;
    const startT = new Date(data!.trip.startTime).getTime();
    const endT = new Date(data!.trip.endTime).getTime();
    const splitDate = parseDatetimeLocal(splitAt);
    if (!splitDate) return;
    const t = splitDate.getTime();
    if (t <= startT || t >= endT) return;
    splitTrip(tripId, { splitAt: splitDate.toISOString() })
      .then((r) => {
        setSplitModalOpen(false);
        setShowActionsMenu(false);
        navigate(r.trips[0] ? `/trips/${r.trips[0].id}` : '/trips');
      })
      .catch(() => {});
  };

  const handleAddStop = () => {
    if (!tripId || !addStopTime || !data?.positions?.length) return;
    const parsedAddStop = parseDatetimeLocal(addStopTime);
    if (!parsedAddStop) return;
    let lat: number;
    let lon: number;
    if (addStopFromMap) {
      lat = addStopFromMap.lat;
      lon = addStopFromMap.lon;
    } else {
      const target = parsedAddStop.getTime();
      let best = data.positions[0];
      let bestDiff = Math.abs(new Date(best.timestamp).getTime() - target);
      for (let i = 1; i < data.positions.length; i++) {
        const diff = Math.abs(new Date(data.positions[i].timestamp).getTime() - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = data.positions[i];
        }
      }
      lat = best.latitude;
      lon = best.longitude;
    }
    const name = addStopName.trim() || `Stop ${addedStops.length + 1}`;
    const parsedAddStopEnd = addStopEndTime ? parseDatetimeLocal(addStopEndTime) : null;
    const endTs = parsedAddStopEnd && parsedAddStopEnd.getTime() > parsedAddStop.getTime()
      ? parsedAddStopEnd.toISOString()
      : undefined;
    addTripStop(tripId, {
      label: name,
      startTime: parsedAddStop.toISOString(),
      endTime: endTs,
      latitude: lat,
      longitude: lon,
    })
      .then(() => fetchTrip(tripId))
      .then(setData)
      .then(() => {
        setAddStopTime('');
        setAddStopEndTime('');
        setAddStopName('');
        setAddStopFromMap(null);
        setAddStopModalOpen(false);
      })
      .catch(() => {});
  };

  const isAddedStop = (stopId: string | undefined) => stopId != null && addedStops.some((s) => s.id === stopId);

  const handleRenameStop = (stopId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed || !tripId) return;
    updateTripStop(tripId, stopId, { label: trimmed })
      .then(() => fetchTrip(tripId))
      .then(setData)
      .then(() => {
        setEditingStopId(null);
        setEditingStopLabel('');
      })
      .catch(() => {});
  };

  const removeDetectedStop = (id: string) => {
    setHiddenDetectedStopIds((prev) => new Set(prev).add(id));
  };

  const handleRenameDetectedStop = (id: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (trimmed) setRenamedDetectedStops((prev) => ({ ...prev, [id]: trimmed }));
    setEditingDetectedStopId(null);
  };

  const handleRemoveStop = (stopId: string) => {
    if (!tripId) return;
    deleteTripStop(tripId, stopId)
      .then(() => fetchTrip(tripId))
      .then(setData)
      .catch(() => {});
  };

  const handleEditTimesSave = () => {
    if (!tripId || !editStartTime || !editEndTime) return;
    const startDate = parseDatetimeLocal(editStartTime);
    const endDate = parseDatetimeLocal(editEndTime);
    if (!startDate || !endDate) return;
    const start = startDate.getTime();
    const end = endDate.getTime();
    if (end <= start) return;
    updateTrip(tripId, {
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    })
      .then((r) => {
        setData((prev) => (prev ? { ...prev, trip: r.trip } : null));
        setEditTimesModalOpen(false);
        setShowActionsMenu(false);
      })
      .catch(() => {});
  };

  if (!tripId) {
    return (
      <div className="page">
        <p className="muted">Missing trip.</p>
        <Link to="/trips">Back to trips</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading trip…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <p className="form-error">{error ?? 'Trip not found.'}</p>
        <Link to="/trips">Back to trips</Link>
      </div>
    );
  }

  const { trip, positions, stats, adjacentTrips = { previous: null, next: null } } = data;
  const title = trip.name || `${trip.vehicle?.name ?? 'Trip'} · ${formatDateTime(trip.startTime)}`;

  const handleExportGpx = () => {
    if (positions.length === 0) return;
    downloadGpx(positions, title, trip.id);
    setShowActionsMenu(false);
  };

  const handleCreateTripBookmark = async (
    latitude: number,
    longitude: number,
    defaultName: string,
    notes: string,
  ) => {
    if (savingBookmark) return;
    const name = window.prompt('Location name', defaultName)?.trim();
    if (!name) return;
    setSavingBookmark(true);
    try {
      await createSavedLocation({
        name,
        latitude,
        longitude,
        notes,
      });
      const response = await fetchSavedLocations();
      setSavedLocations(response.locations);
      setTripMapMode('none');
      window.alert(`Saved location "${name}".`);
    } catch (err) {
      window.alert(getErrorMessage(err, 'Failed to save location'));
    } finally {
      setSavingBookmark(false);
    }
  };

  const handleTripMapBookmarkCreate = async (lat: number, lon: number) => {
    await handleCreateTripBookmark(lat, lon, `${title} bookmark`, `Saved from trip map for "${title}"`);
  };

  const splitMin = formatIsoForDatetimeLocal(trip.startTime);
  const splitMax = formatIsoForDatetimeLocal(trip.endTime);

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/trips" className="btn-link" style={{ fontSize: '1.25rem' }} aria-label="Back to trips">
            ←
          </Link>
          <h1 className="page-heading" style={{ margin: 0 }}>
            {title}
          </h1>
        </div>
        <div className="trip-detail-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => adjacentTrips.previous && navigate(`/trips/${adjacentTrips.previous.id}`)}
            disabled={!adjacentTrips.previous}
          >
            Prev trip
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => adjacentTrips.next && navigate(`/trips/${adjacentTrips.next.id}`)}
            disabled={!adjacentTrips.next}
          >
            Next trip
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowActionsMenu((v) => !v)}
            aria-expanded={showActionsMenu}
            aria-haspopup="true"
          >
            Actions ⋮
          </button>
          {showActionsMenu && (
            <>
              <div
                className="trip-detail-actions-backdrop"
                role="presentation"
                onClick={() => setShowActionsMenu(false)}
              />
              <ul className="card trip-detail-actions-menu" role="menu">
                <li>
                  <button
                    type="button"
                    className="btn-link"
                    style={{ width: '100%', textAlign: 'left' }}
                    role="menuitem"
                    onClick={() => {
                      setShowActionsMenu(false);
                      setRenameInput(trip.name ?? '');
                      setRenameModalOpen(true);
                    }}
                  >
                    Rename trip
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="btn-link"
                    style={{ width: '100%', textAlign: 'left' }}
                    role="menuitem"
                    onClick={() => {
                      setShowActionsMenu(false);
                      setEditStartTime(formatIsoForDatetimeLocal(trip.startTime));
                      setEditEndTime(formatIsoForDatetimeLocal(trip.endTime));
                      setEditTimesModalOpen(true);
                    }}
                  >
                    Edit times
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="btn-link"
                    style={{ width: '100%', textAlign: 'left' }}
                    role="menuitem"
                    onClick={handleExportGpx}
                    disabled={positions.length === 0}
                  >
                    Export GPX
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="btn-link"
                    style={{ width: '100%', textAlign: 'left' }}
                    role="menuitem"
                    onClick={() => {
                      setShowActionsMenu(false);
                      setSplitAt('');
                      setSplitModalOpen(true);
                    }}
                    disabled={positions.length < 2}
                  >
                    Split trip
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="btn-link"
                    style={{ width: '100%', textAlign: 'left' }}
                    role="menuitem"
                    onClick={() => {
                      setShowActionsMenu(false);
                      setAddStopFromMap(null);
                      setAddStopTime(formatIsoForDatetimeLocal(trip.startTime));
                      setAddStopEndTime('');
                      setAddStopName('');
                      setAddStopModalOpen(true);
                    }}
                    disabled={positions.length === 0}
                  >
                    Add stop
                  </button>
                </li>
              </ul>
            </>
          )}
        </div>
      </div>

      {positions.length > 0 && (
        <section className="page-section" style={{ marginBottom: '1rem' }}>
          <div className="tracking-map-wrap">
            <TrackMap
              positions={mapPoints}
              stops={mapStops}
              bookmarks={mapBookmarks}
              showRoute
              height="320px"
              onAddStopAtPoint={tripMapMode === 'stop' ? ({ lat, lon, timestamp }) => {
                setAddStopFromMap({ lat, lon });
                setAddStopTime(formatIsoForDatetimeLocal(timestamp));
                setAddStopEndTime('');
                setAddStopName('');
                setAddStopModalOpen(true);
              } : undefined}
              onMapClick={tripMapMode === 'bookmark' ? (lat, lon) => void handleTripMapBookmarkCreate(lat, lon) : undefined}
            />
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <a
              href={`https://www.openstreetmap.org/?mlat=${positions[0].latitude}&mlon=${positions[0].longitude}&zoom=14`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-link"
            >
              Open in OpenStreetMap
            </a>
            {' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => setTripMapMode((current) => (current === 'stop' ? 'none' : 'stop'))}
            >
              {tripMapMode === 'stop' ? 'Cancel stop mode' : 'Add stop from map'}
            </button>
            {' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => setTripMapMode((current) => (current === 'bookmark' ? 'none' : 'bookmark'))}
              disabled={savingBookmark}
            >
              {tripMapMode === 'bookmark' ? 'Cancel bookmark mode' : savingBookmark ? 'Saving bookmark...' : 'Save bookmark from map'}
            </button>
          </div>
          {tripMapMode === 'stop' && (
            <p className="card-meta" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              Tap the route or a route point on the map to add a stop at that location and time.
            </p>
          )}
          {tripMapMode === 'bookmark' && (
            <p className="card-meta" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              Click or tap the map to save a bookmarked location.
            </p>
          )}
        </section>
      )}

      <section className="page-section">
        <h3 className="page-heading">Location records</h3>
        <ul className="trip-location-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {locationRecords.length > 0 ? (
            locationRecords.map((rec, i) => {
              const isAdded = rec.type === 'stop' && !rec.isDetectedStop && isAddedStop(rec.stopId);
              const isDetected = rec.type === 'stop' && rec.isDetectedStop;
              const isEditingAdded = rec.stopId != null && !rec.isDetectedStop && editingStopId === rec.stopId;
              const isEditingDetected = rec.stopId != null && rec.isDetectedStop && editingDetectedStopId === rec.stopId;
              return (
                <li key={rec.type + (rec.stopId ?? i)} className="trip-location-record">
                  <span className="trip-location-icon" aria-hidden>
                    {rec.type === 'start' ? '🟢' : rec.type === 'end' ? '🔴' : '🟠'}
                  </span>
                  <div className="trip-location-body" style={{ flex: 1, minWidth: 0 }}>
                    <div className="trip-location-datetime">{rec.dateTime}</div>
                    <div className="trip-location-place" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {rec.type === 'start' ? (
                        'Start'
                      ) : rec.type === 'end' ? (
                        'End'
                      ) : isEditingAdded ? (
                        <>
                          <input
                            type="text"
                            className="input"
                            value={editingStopLabel}
                            onChange={(e) => setEditingStopLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameStop(rec.stopId!, editingStopLabel);
                              if (e.key === 'Escape') setEditingStopId(null);
                            }}
                            onBlur={() => editingStopLabel.trim() && handleRenameStop(rec.stopId!, editingStopLabel)}
                            autoFocus
                            style={{ width: '12rem', maxWidth: '100%' }}
                          />
                        </>
                      ) : isEditingDetected ? (
                        <input
                          type="text"
                          className="input"
                          value={editingDetectedStopLabel}
                          onChange={(e) => setEditingDetectedStopLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameDetectedStop(rec.stopId!, editingDetectedStopLabel);
                            if (e.key === 'Escape') setEditingDetectedStopId(null);
                          }}
                          onBlur={() => editingDetectedStopLabel.trim() && handleRenameDetectedStop(rec.stopId!, editingDetectedStopLabel)}
                          autoFocus
                          style={{ width: '12rem', maxWidth: '100%' }}
                        />
                      ) : (
                        <>
                          {rec.label ?? 'Stop'}
                          {isAdded && (
                            <>
                              <button
                                type="button"
                                className="btn-link"
                                style={{ fontSize: '0.85rem' }}
                                onClick={() => {
                                  setEditingStopId(rec.stopId!);
                                  setEditingStopLabel(rec.label ?? '');
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="btn-link danger"
                                style={{ fontSize: '0.85rem' }}
                                onClick={() => rec.stopId && handleRemoveStop(rec.stopId)}
                              >
                                Remove
                              </button>
                            </>
                          )}
                          {isDetected && (
                            <>
                              <button
                                type="button"
                                className="btn-link"
                                style={{ fontSize: '0.85rem' }}
                                onClick={() => {
                                  setEditingDetectedStopId(rec.stopId!);
                                  setEditingDetectedStopLabel(rec.label ?? 'Stop');
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="btn-link danger"
                                style={{ fontSize: '0.85rem' }}
                                onClick={() => rec.stopId && removeDetectedStop(rec.stopId)}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {rec.type === 'stop' && (
                      <div className="trip-stop-meta">
                        {rec.stopSource && (
                          <span className={`trip-stop-chip trip-stop-chip--${rec.stopSource}`}>
                            {rec.stopSource === 'detected' ? 'Auto stop' : rec.stopSource === 'manual' ? 'Manual stop' : 'Fuel stop'}
                          </span>
                        )}
                        {rec.durationMs != null && rec.durationMs > 0 && (
                          <span className="trip-stop-chip trip-stop-chip--duration">
                            {formatDurationMs(rec.durationMs)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="trip-location-coords muted">
                      {rec.lat != null && rec.lon != null ? `${rec.lat.toFixed(5)}, ${rec.lon.toFixed(5)}` : '—'}
                    </div>
                  </div>
                </li>
              );
            })
          ) : (
            <li className="muted">No positions</li>
          )}
        </ul>
      </section>

      {latestTelemetry && (
        <section className="page-section">
          <h3 className="page-heading">Telemetry</h3>
          <div className="stats-bar" style={{ flexWrap: 'wrap' }}>
            {latestTelemetry.ignition != null && <span><strong>Ignition:</strong> {latestTelemetry.ignition ? 'On' : 'Off'}</span>}
            {latestTelemetry.batteryPercent != null && <span><strong>Battery:</strong> {Math.round(latestTelemetry.batteryPercent * 100)}%</span>}
            {latestTelemetry.batteryVoltage != null && <span><strong>Voltage:</strong> {latestTelemetry.batteryVoltage.toFixed(1)} V</span>}
            {latestTelemetry.fuelLevel != null && <span><strong>Fuel level:</strong> {Math.round(latestTelemetry.fuelLevel)}%</span>}
            {latestTelemetry.rpm != null && <span><strong>RPM:</strong> {Math.round(latestTelemetry.rpm)}</span>}
            {latestTelemetry.coolantTemp != null && <span><strong>Coolant:</strong> {Math.round(latestTelemetry.coolantTemp)} °C</span>}
            {latestTelemetry.charging != null && <span><strong>Charging:</strong> {latestTelemetry.charging ? 'Yes' : 'No'}</span>}
          </div>
        </section>
      )}

      {stats && (
        <>
          {tripTimelineEvents.length > 0 && (
            <section className="page-section">
              <div className="device-list-header" style={{ alignItems: 'center', marginBottom: timelineExpanded ? '0.75rem' : 0 }}>
                <h3 className="page-heading" style={{ margin: 0 }}>Timeline</h3>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setTimelineExpanded((current) => !current)}
                  aria-expanded={timelineExpanded}
                >
                  {timelineExpanded ? 'Collapse' : `Expand (${tripTimelineEvents.length})`}
                </button>
              </div>
              {timelineExpanded && (
                <ul className="list">
                  {tripTimelineEvents.map((event) => (
                    <li key={event.id} className="list-item">
                      <div className="list-item-main">
                        <div className="device-list-header" style={{ alignItems: 'baseline' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {event.badge && (
                              <span className={`trip-stop-chip ${event.badgeClassName ?? 'trip-stop-chip--duration'}`}>
                                {event.badge}
                              </span>
                            )}
                            <strong>{event.title}</strong>
                          </div>
                          <span className="muted">{event.dateTime}</span>
                        </div>
                        {event.detail && <div className="muted" style={{ marginTop: '0.2rem' }}>{event.detail}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className="page-section">
            <h3 className="page-heading">Trip summary</h3>
            <div className="trip-stats-grid">
              <div className="trip-stat-card">
                <span className="trip-stat-icon" aria-hidden>🛣️</span>
                <span className="trip-stat-value">{formatDistance(stats.odometerKm, preferences.distanceUnit)}</span>
                <span className="trip-stat-label">Distance</span>
              </div>
              <div className="trip-stat-card">
                <span className="trip-stat-icon" aria-hidden>⏱️</span>
                <span className="trip-stat-value">{formatDurationMs(durationMs)}</span>
                <span className="trip-stat-label">Travel time</span>
              </div>
              <div className="trip-stat-card">
                <span className="trip-stat-icon" aria-hidden>📊</span>
                <span className="trip-stat-value">{stats.pointCount}</span>
                <span className="trip-stat-label">Points</span>
              </div>
            </div>
            {timeBreakdown && (timeBreakdown.stoppedMs > 0 || timeBreakdown.segments.length > 1) && (
              <div className="trip-time-breakdown">
                {(timeBreakdown.stoppedMs > 0 || timeBreakdown.drivingMs < timeBreakdown.totalMs) && (
                  <div className="trip-stats-grid" style={{ marginTop: '0.75rem' }}>
                    {timeBreakdown.drivingMs > 0 && (
                      <div className="trip-stat-card trip-stat-card-sub">
                        <span className="trip-stat-label">Driving</span>
                        <span className="trip-stat-value">{formatDurationMs(timeBreakdown.drivingMs)}</span>
                      </div>
                    )}
                    {timeBreakdown.stoppedMs > 0 && (
                      <div className="trip-stat-card trip-stat-card-sub">
                        <span className="trip-stat-label">Stopped</span>
                        <span className="trip-stat-value">{formatDurationMs(timeBreakdown.stoppedMs)}</span>
                      </div>
                    )}
                  </div>
                )}
                {timeBreakdown.segments.filter((s) => s.durationMs > 0).length > 1 && (
                  <ul className="trip-time-segments" style={{ marginTop: '0.75rem', marginBottom: 0, paddingLeft: '1.25rem' }}>
                    {timeBreakdown.segments.filter((s) => s.durationMs > 0).map((seg, i) => (
                      <li key={i} className="trip-time-segment">
                        <span className={seg.type === 'stop' ? 'trip-time-stop' : undefined}>
                          {seg.type === 'stop' ? '⏸ ' : '→ '}{seg.label}:
                        </span>{' '}
                        {formatDurationMs(seg.durationMs)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
          <section className="page-section">
            <h3 className="page-heading">Speed</h3>
            <div className="trip-stats-grid">
              <div className="trip-stat-card">
                <span className="trip-stat-icon" aria-hidden>🚀</span>
                <span className="trip-stat-value">{formatSpeed(stats.maxSpeedKmh, preferences.distanceUnit)}</span>
                <span className="trip-stat-label">Top speed</span>
              </div>
              <div className="trip-stat-card">
                <span className="trip-stat-icon" aria-hidden>📐</span>
                <span className="trip-stat-value">{formatSpeed(stats.avgSpeedKmh, preferences.distanceUnit)}</span>
                <span className="trip-stat-label">Average speed</span>
              </div>
            </div>
          </section>
        </>
      )}

      {positionsForChart.length >= 2 && (
        <section className="page-section">
          <SpeedChart
            positions={positionsForChart}
            speedUnit={preferences.distanceUnit === 'mi' ? 'mph' : 'km/h'}
            useMph={preferences.distanceUnit === 'mi'}
            plotSpeed
            plotAltitude={false}
            plotBattery={false}
          />
        </section>
      )}

      <div style={{ marginTop: '1rem' }}>
        <Link to="/trips" className="btn btn-secondary">
          Back to trips
        </Link>
      </div>

      {renameModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setRenameModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-trip-title"
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-dialog-header">
              <h3 id="rename-trip-title" className="modal-dialog-title">Rename trip</h3>
              <button type="button" className="modal-dialog-close" onClick={() => setRenameModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-dialog-body">
              <label className="form-row">
                <span>Name</span>
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  className="input"
                  placeholder="Trip name"
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleRenameSave}>
                  Save
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setRenameModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editTimesModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setEditTimesModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-times-trip-title"
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-dialog-header">
              <h3 id="edit-times-trip-title" className="modal-dialog-title">Edit trip times</h3>
              <button type="button" className="modal-dialog-close" onClick={() => setEditTimesModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-dialog-body">
              <label className="form-row">
                <span>Start time</span>
                <input
                  type="datetime-local"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  className="input"
                />
              </label>
              <label className="form-row">
                <span>End time</span>
                <input
                  type="datetime-local"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  className="input"
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleEditTimesSave}
                  disabled={!editStartTime || !editEndTime || new Date(editEndTime).getTime() <= new Date(editStartTime).getTime()}
                >
                  Save
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditTimesModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {splitModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setSplitModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="split-trip-title"
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-dialog-header">
              <h3 id="split-trip-title" className="modal-dialog-title">Split trip</h3>
              <button type="button" className="modal-dialog-close" onClick={() => setSplitModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-dialog-body">
              <p className="card-meta">Pick a time between start and end. This creates two trips and deletes the current one.</p>
              <label className="form-row">
                <span>Split at</span>
                <input
                  type="datetime-local"
                  value={splitAt}
                  onChange={(e) => setSplitAt(e.target.value)}
                  className="input"
                  min={splitMin}
                  max={splitMax}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleSplit} disabled={!splitAt}>
                  Split
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setSplitModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {addStopModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && (setAddStopModalOpen(false), setAddStopFromMap(null))}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-stop-title"
        >
          <div className="modal-dialog add-stop-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-dialog-header">
              <h3 id="add-stop-title" className="modal-dialog-title">Add stop</h3>
              <button type="button" className="modal-dialog-close" onClick={() => { setAddStopModalOpen(false); setAddStopFromMap(null); }} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-dialog-body">
              <p className="card-meta">Pick start (and optional end) time within the trip. You can name it now or rename it later in the list.</p>
              <label className="form-row add-stop-datetime-row">
                <span>Start date</span>
                <input
                  type="date"
                  value={addStopTime ? addStopTime.slice(0, 10) : ''}
                  onChange={(e) => {
                    const d = e.target.value;
                    const t = (addStopTime && addStopTime.length >= 16) ? addStopTime.slice(11, 16) : splitMin.slice(11, 16);
                    setAddStopTime(d ? `${d}T${t}` : '');
                  }}
                  className="input"
                  min={splitMin.slice(0, 10)}
                  max={splitMax.slice(0, 10)}
                />
              </label>
              <label className="form-row add-stop-datetime-row">
                <span>Start time</span>
                <input
                  type="time"
                  value={addStopTime ? addStopTime.slice(11, 16) : ''}
                  onChange={(e) => {
                    const t = e.target.value;
                    const d = (addStopTime && addStopTime.length >= 10) ? addStopTime.slice(0, 10) : splitMin.slice(0, 10);
                    setAddStopTime(t ? `${d}T${t}` : (d ? `${d}T${splitMin.slice(11, 16)}` : ''));
                  }}
                  className="input"
                  min={addStopTime ? undefined : splitMin.slice(11, 16)}
                  max={splitMax.slice(11, 16)}
                  step="1"
                />
              </label>
              <label className="form-row add-stop-datetime-row">
                <span>End date (optional)</span>
                <input
                  type="date"
                  value={addStopEndTime ? addStopEndTime.slice(0, 10) : ''}
                  onChange={(e) => {
                    const d = e.target.value;
                    const t = addStopEndTime ? addStopEndTime.slice(11, 16) : '';
                    setAddStopEndTime(d && t ? `${d}T${t}` : d ? `${d}T${addStopTime ? addStopTime.slice(11, 16) : splitMax.slice(11, 16)}` : '');
                  }}
                  className="input"
                  min={addStopTime ? addStopTime.slice(0, 10) : splitMin.slice(0, 10)}
                  max={splitMax.slice(0, 10)}
                />
              </label>
              <label className="form-row add-stop-datetime-row">
                <span>End time (optional)</span>
                <input
                  type="time"
                  value={addStopEndTime ? addStopEndTime.slice(11, 16) : ''}
                  onChange={(e) => {
                    const t = e.target.value;
                    const d = addStopEndTime ? addStopEndTime.slice(0, 10) : (addStopTime ? addStopTime.slice(0, 10) : splitMin.slice(0, 10));
                    setAddStopEndTime(t ? `${d}T${t}` : '');
                  }}
                  className="input"
                  min={addStopTime ? addStopTime.slice(11, 16) : undefined}
                  max={splitMax.slice(11, 16)}
                  step="1"
                />
              </label>
              <label className="form-row">
                <span>Name</span>
                <input
                  type="text"
                  value={addStopName}
                  onChange={(e) => setAddStopName(e.target.value)}
                  className="input"
                  placeholder="e.g. Coffee break, Home"
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleAddStop} disabled={!addStopTime}>
                  Add stop
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setAddStopModalOpen(false); setAddStopFromMap(null); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
