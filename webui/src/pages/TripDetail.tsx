import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { fetchVehicle, fetchVehicleTrips, createTripMerge, fetchTripMerges, deleteTripMerge, type Vehicle, type Trip } from '../api/vehicles';
import { fetchPositionStats, fetchLatestPositions, type Position } from '../api/positions';
import { TrackMap, type MapStop } from '../components/TrackMap';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance, formatSpeed, formatDurationMs } from '../utils/units';
import { computeTimeBreakdown } from '../utils/timeBreakdown';

function formatTripId(iso: string): string {
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleDateString('en-GB', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${mon}${year}`;
  } catch {
    return 'trip';
  }
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

function toDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  } catch {
    return iso.slice(0, 16);
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildGpx(positions: Position[], trackName: string): string {
  const trkpts = positions
    .map(
      (p) =>
        `    <trkpt lat="${p.latitude}" lon="${p.longitude}"><time>${new Date(p.timestamp).toISOString()}</time>${p.speed != null ? `<extensions><speed>${p.speed}</speed></extensions>` : ''}</trkpt>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Movara" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function downloadGpx(positions: Position[], trackName: string, tripId: string): void {
  const gpx = buildGpx(positions, trackName);
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trip-${tripId.replace(/\s+/g, '-')}-${Date.now()}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface AddedStop {
  id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  label?: string;
}

export function TripDetail() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [searchParams] = useSearchParams();
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const navigate = useNavigate();
  const { preferences } = usePreferences();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stats, setStats] = useState<{ odometerKm: number; maxSpeedKmh: number; avgSpeedKmh: number; pointCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedStops, setAddedStops] = useState<AddedStop[]>([]);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitAt, setSplitAt] = useState('');
  const [addStopModalOpen, setAddStopModalOpen] = useState(false);
  const [addStopTime, setAddStopTime] = useState('');
  const [addStopFromMap, setAddStopFromMap] = useState<{ lat: number; lon: number } | null>(null);
  const [customTripName, setCustomTripName] = useState<string>('');
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [copyLinkFeedback, setCopyLinkFeedback] = useState<string | null>(null);
  const [adjacentTrips, setAdjacentTrips] = useState<{ previous: Trip | null; next: Trip | null }>({ previous: null, next: null });
  const [tripMerges, setTripMerges] = useState<{ gapAfter: string; gapBefore: string }[]>([]);
  const [mergeInProgress, setMergeInProgress] = useState(false);
  const MERGE_TOLERANCE_MS = 2000;

  const from = fromParam || '';
  const to = toParam || '';
  const validRange = from && to && vehicleId;
  const tripNameStorageKey = useMemo(
    () => (vehicleId && from && to ? `trip-name-${vehicleId}-${from}-${to}` : ''),
    [vehicleId, from, to]
  );

  useEffect(() => {
    if (!tripNameStorageKey) return;
    try {
      const saved = localStorage.getItem(tripNameStorageKey);
      setCustomTripName(saved ?? '');
    } catch {
      setCustomTripName('');
    }
  }, [tripNameStorageKey]);

  useEffect(() => {
    if (!validRange) {
      setLoading(false);
      setError('Missing vehicle, from or to.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchVehicle(vehicleId!)
      .then((r) => {
        if (cancelled) return;
        setVehicle(r.vehicle);
        if (!r.vehicle.deviceId) {
          setError('Vehicle has no linked device.');
          setLoading(false);
          return;
        }
        const deviceId = r.vehicle.deviceId;
        return Promise.all([
          fetchLatestPositions(deviceId, { from, to }),
          fetchPositionStats(deviceId, from, to),
        ]).then(([posRes, statsRes]) => {
          if (cancelled) return;
          setPositions(posRes.positions || []);
          setStats({
            odometerKm: statsRes.odometerKm,
            maxSpeedKmh: statsRes.maxSpeedKmh,
            avgSpeedKmh: statsRes.avgSpeedKmh,
            pointCount: statsRes.pointCount,
          });
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Failed to load trip.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, from, to, validRange]);

  useEffect(() => {
    if (!vehicleId || !vehicle?.deviceId || !from || !to) return;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const rangeDays = 14;
    const fetchFrom = new Date(fromDate.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const fetchTo = new Date(toDate.getTime() + rangeDays * 24 * 60 * 60 * 1000);
    fetchVehicleTrips(vehicleId, fetchFrom.toISOString(), fetchTo.toISOString())
      .then((res) => {
        const trips = res.trips || [];
        const fromT = new Date(from).getTime();
        const toT = new Date(to).getTime();
        const idx = trips.findIndex(
          (t) =>
            Math.abs(new Date(t.startedAt).getTime() - fromT) < 2000 &&
            Math.abs(new Date(t.endedAt).getTime() - toT) < 2000
        );
        setAdjacentTrips({
          previous: idx > 0 ? trips[idx - 1]! : null,
          next: idx >= 0 && idx < trips.length - 1 ? trips[idx + 1]! : null,
        });
      })
      .catch(() => setAdjacentTrips({ previous: null, next: null }));
  }, [vehicleId, vehicle?.deviceId, from, to]);

  useEffect(() => {
    if (!vehicleId) return;
    fetchTripMerges(vehicleId)
      .then((r) => setTripMerges(r.tripMerges.map((m) => ({ gapAfter: m.gapAfter, gapBefore: m.gapBefore }))))
      .catch(() => setTripMerges([]));
  }, [vehicleId]);

  const tripId = useMemo(() => (from ? formatTripId(from) : ''), [from]);
  const durationMs = useMemo(() => {
    if (!from || !to) return 0;
    return new Date(to).getTime() - new Date(from).getTime();
  }, [from, to]);

  const fromT = useMemo(() => (from ? new Date(from).getTime() : 0), [from]);
  const toT = useMemo(() => (to ? new Date(to).getTime() : 0), [to]);
  const [hiddenDetectedStopIds, setHiddenDetectedStopIds] = useState<Set<string>>(() => new Set());
  const [renamedDetectedStops, setRenamedDetectedStops] = useState<Record<string, string>>({});
  const [editingDetectedStopId, setEditingDetectedStopId] = useState<string | null>(null);
  const [editingDetectedStopLabel, setEditingDetectedStopLabel] = useState('');
  const timeBreakdown = useMemo(() => {
    if (!fromT || !toT) return null;
    return computeTimeBreakdown(fromT, toT, {
      positions: positions.map((p) => ({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp })),
      excludeDetectedStopIds: hiddenDetectedStopIds.size > 0 ? Array.from(hiddenDetectedStopIds) : undefined,
    });
  }, [fromT, toT, positions, hiddenDetectedStopIds]);

  const mapPoints = useMemo(() => {
    const list: { lat: number; lon: number; time?: string; timestamp?: string; label?: string }[] = [];
    positions.forEach((p) => {
      const ts = typeof p.timestamp === 'string' ? p.timestamp : new Date(p.timestamp).toISOString();
      list.push({
        lat: p.latitude,
        lon: p.longitude,
        time: formatDateTime(ts),
        timestamp: ts,
        label: undefined,
      });
    });
    return list;
  }, [positions]);

  const mapStops = useMemo((): MapStop[] => {
    const stops: MapStop[] = [];
    addedStops.forEach((s) => stops.push({ lat: s.latitude, lon: s.longitude, label: s.label }));
    (timeBreakdown?.detectedStopsForDisplay ?? []).forEach((s) =>
      stops.push({ lat: s.latitude, lon: s.longitude, label: renamedDetectedStops[s.id] ?? s.label })
    );
    return stops;
  }, [addedStops, timeBreakdown?.detectedStopsForDisplay, renamedDetectedStops]);

  const locationRecords = useMemo(() => {
    type Record = {
      type: 'start' | 'end' | 'stop';
      dateTime: string;
      lat: number;
      lon: number;
      label?: string;
      stopId?: string;
      isDetectedStop?: boolean;
      stopSource?: 'manual' | 'detected';
      durationMs?: number;
    };
    const records: Record[] = [];
    if (positions.length === 0) return records;
    const start = positions[0];
    const end = positions[positions.length - 1];
    records.push({ type: 'start', dateTime: formatDateTime(start.timestamp), lat: start.latitude, lon: start.longitude });
    const allStops: Array<{ time: number; record: Record }> = [];
    addedStops
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach((s) => {
        allStops.push({
          time: new Date(s.timestamp).getTime(),
          record: {
            type: 'stop',
            dateTime: formatDateTime(s.timestamp),
            lat: s.latitude,
            lon: s.longitude,
            label: s.label,
            stopId: s.id,
            isDetectedStop: false,
            stopSource: 'manual',
          },
        });
      });
    (timeBreakdown?.detectedStopsForDisplay ?? []).forEach((s) => {
      const dateTimeStr =
        s.startMs !== s.endMs
          ? `${formatDateTime(new Date(s.startMs).toISOString())} – ${formatDateTime(new Date(s.endMs).toISOString())}`
          : formatDateTime(new Date(s.startMs).toISOString());
      allStops.push({
        time: s.startMs,
        record: {
          type: 'stop',
          dateTime: dateTimeStr,
          lat: s.latitude,
          lon: s.longitude,
          label: renamedDetectedStops[s.id] ?? s.label,
          stopId: s.id,
          isDetectedStop: true,
          stopSource: 'detected',
          durationMs: Math.max(0, s.endMs - s.startMs),
        },
      });
    });
    allStops.sort((a, b) => a.time - b.time).forEach(({ record }) => records.push(record));
    records.push({ type: 'end', dateTime: formatDateTime(end.timestamp), lat: end.latitude, lon: end.longitude });
    return records;
  }, [positions, addedStops, timeBreakdown?.detectedStopsForDisplay, renamedDetectedStops]);

  const handleAddStop = () => {
    if (!addStopTime || positions.length === 0) return;
    let latitude: number;
    let longitude: number;
    if (addStopFromMap) {
      latitude = addStopFromMap.lat;
      longitude = addStopFromMap.lon;
    } else {
      const target = new Date(addStopTime).getTime();
      let best = positions[0];
      let bestDiff = Math.abs(new Date(best.timestamp).getTime() - target);
      for (let i = 1; i < positions.length; i++) {
        const diff = Math.abs(new Date(positions[i].timestamp).getTime() - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = positions[i];
        }
      }
      latitude = best.latitude;
      longitude = best.longitude;
    }
    setAddedStops((prev) => [
      ...prev,
      {
        id: `stop-${Date.now()}`,
        timestamp: new Date(addStopTime).toISOString(),
        latitude,
        longitude,
        label: `Stop ${prev.length + 1}`,
      },
    ]);
    setAddStopTime('');
    setAddStopFromMap(null);
    setAddStopModalOpen(false);
  };

  const removeStop = (id: string) => {
    setAddedStops((prev) => prev.filter((s) => s.id !== id));
  };

  const removeDetectedStop = (id: string) => {
    setHiddenDetectedStopIds((prev) => new Set(prev).add(id));
  };

  const handleRenameDetectedStop = (id: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (trimmed) setRenamedDetectedStops((prev) => ({ ...prev, [id]: trimmed }));
    setEditingDetectedStopId(null);
  };

  const handleRenameSave = () => {
    const name = renameInput.trim();
    if (!tripNameStorageKey) return;
    try {
      if (name) localStorage.setItem(tripNameStorageKey, name);
      else localStorage.removeItem(tripNameStorageKey);
      setCustomTripName(name);
    } catch {
      /* ignore */
    }
    setRenameModalOpen(false);
    setShowActionsMenu(false);
  };

  const handleExportGpx = () => {
    if (positions.length === 0) return;
    const name = customTripName || `Trip ${tripId}`;
    downloadGpx(positions, name, tripId);
    setShowActionsMenu(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyLinkFeedback('Copied!');
      setTimeout(() => setCopyLinkFeedback(null), 2000);
    } catch {
      setCopyLinkFeedback('Failed');
      setTimeout(() => setCopyLinkFeedback(null), 2000);
    }
    setShowActionsMenu(false);
  };

  const mergeAtStart = useMemo(
    () => tripMerges.find((m) => Math.abs(new Date(m.gapBefore).getTime() - fromT) <= MERGE_TOLERANCE_MS),
    [tripMerges, fromT]
  );
  const mergeAtEnd = useMemo(
    () => tripMerges.find((m) => Math.abs(new Date(m.gapAfter).getTime() - toT) <= MERGE_TOLERANCE_MS),
    [tripMerges, toT]
  );

  const handleMergeWithPrevious = () => {
    const prev = adjacentTrips.previous;
    if (!prev || !vehicleId) return;
    setMergeInProgress(true);
    setShowActionsMenu(false);
    createTripMerge(vehicleId, prev.endedAt, from)
      .then(() => {
        navigate(`/vehicles/${vehicleId}/trip?from=${encodeURIComponent(prev.startedAt)}&to=${encodeURIComponent(to)}`);
      })
      .catch(() => setMergeInProgress(false));
  };

  const handleMergeWithNext = () => {
    const next = adjacentTrips.next;
    if (!next || !vehicleId) return;
    setMergeInProgress(true);
    setShowActionsMenu(false);
    createTripMerge(vehicleId, to, next.startedAt)
      .then(() => {
        navigate(`/vehicles/${vehicleId}/trip?from=${encodeURIComponent(from)}&to=${encodeURIComponent(next.endedAt)}`);
      })
      .catch(() => setMergeInProgress(false));
  };

  const handleUnmergeFromPrevious = () => {
    if (!mergeAtStart || !vehicleId) return;
    setShowActionsMenu(false);
    deleteTripMerge(vehicleId, mergeAtStart.gapAfter, mergeAtStart.gapBefore).then(() => {
      setTripMerges((prev) => prev.filter((m) => m.gapAfter !== mergeAtStart.gapAfter || m.gapBefore !== mergeAtStart.gapBefore));
      navigate(`/vehicles/${vehicleId}`);
    });
  };

  const handleUnmergeFromNext = () => {
    if (!mergeAtEnd || !vehicleId) return;
    setShowActionsMenu(false);
    deleteTripMerge(vehicleId, mergeAtEnd.gapAfter, mergeAtEnd.gapBefore).then(() => {
      setTripMerges((prev) => prev.filter((m) => m.gapAfter !== mergeAtEnd.gapAfter || m.gapBefore !== mergeAtEnd.gapBefore));
      navigate(`/vehicles/${vehicleId}`);
    });
  };

  const handleSplit = () => {
    if (!splitAt || !vehicle?.deviceId) return;
    const t = new Date(splitAt).getTime();
    const fromT = new Date(from).getTime();
    const toT = new Date(to).getTime();
    if (t <= fromT || t >= toT) return;
    setSplitModalOpen(false);
    setShowActionsMenu(false);
    navigate(
      `/tracking?deviceId=${encodeURIComponent(vehicle.deviceId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date(t).toISOString())}`
    );
  };

  if (!vehicleId) {
    return (
      <div className="page">
        <p className="muted">Missing vehicle.</p>
        <Link to="/vehicles">Back to vehicles</Link>
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

  if (error || !validRange) {
    return (
      <div className="page">
        <p className="muted">{error || 'Invalid trip parameters.'}</p>
        <Link to={`/vehicles/${vehicleId}`}>Back to vehicle</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="trip-detail-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to={`/vehicles/${vehicleId}`} className="btn-link" style={{ fontSize: '1.25rem' }} aria-label="Back">
            ←
          </Link>
          <h1 className="page-heading" style={{ margin: 0 }}>
            {customTripName || `Trip ${tripId}`}
          </h1>
        </div>
        <div className="trip-detail-actions">
          {copyLinkFeedback && (
            <span className="trip-copy-feedback" style={{ marginRight: '0.5rem', fontSize: '0.85rem', color: 'var(--accent)' }}>
              {copyLinkFeedback}
            </span>
          )}
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
                  <button type="button" className="btn-link" style={{ width: '100%', textAlign: 'left' }} role="menuitem" onClick={() => { setShowActionsMenu(false); setRenameInput(customTripName); setRenameModalOpen(true); }}>
                    Rename trip
                  </button>
                </li>
                <li>
                  <button type="button" className="btn-link" style={{ width: '100%', textAlign: 'left' }} role="menuitem" onClick={handleExportGpx} disabled={positions.length === 0}>
                    Export GPX
                  </button>
                </li>
                <li>
                  <button type="button" className="btn-link" style={{ width: '100%', textAlign: 'left' }} role="menuitem" onClick={handleCopyLink}>
                    Copy link
                  </button>
                </li>
                <li>
                  <button type="button" className="btn-link" style={{ width: '100%', textAlign: 'left' }} role="menuitem" onClick={() => { setShowActionsMenu(false); setSplitModalOpen(true); }}>
                    Split trip
                  </button>
                </li>
                <li>
                  <button type="button" className="btn-link" style={{ width: '100%', textAlign: 'left' }} role="menuitem" onClick={() => { setShowActionsMenu(false); setAddStopFromMap(null); setAddStopTime(from.slice(0, 16)); setAddStopModalOpen(true); }}>
                    Add stop
                  </button>
                </li>
                {adjacentTrips.previous && (
                  <li>
                    <button
                      type="button"
                      className="btn-link"
                      style={{ width: '100%', textAlign: 'left' }}
                      role="menuitem"
                      onClick={handleMergeWithPrevious}
                      disabled={mergeInProgress}
                    >
                      Merge with previous trip
                    </button>
                  </li>
                )}
                {adjacentTrips.next && (
                  <li>
                    <button
                      type="button"
                      className="btn-link"
                      style={{ width: '100%', textAlign: 'left' }}
                      role="menuitem"
                      onClick={handleMergeWithNext}
                      disabled={mergeInProgress}
                    >
                      Merge with next trip
                    </button>
                  </li>
                )}
                {mergeAtStart && (
                  <li>
                    <button
                      type="button"
                      className="btn-link"
                      style={{ width: '100%', textAlign: 'left' }}
                      role="menuitem"
                      onClick={handleUnmergeFromPrevious}
                    >
                      Unmerge from previous
                    </button>
                  </li>
                )}
                {mergeAtEnd && (
                  <li>
                    <button
                      type="button"
                      className="btn-link"
                      style={{ width: '100%', textAlign: 'left' }}
                      role="menuitem"
                      onClick={handleUnmergeFromNext}
                    >
                      Unmerge from next
                    </button>
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
      </div>

      {positions.length > 0 && (
        <section className="page-section trip-detail-map-section" style={{ marginBottom: '1rem' }}>
          <div className="tracking-map-wrap">
            <TrackMap
              positions={mapPoints}
              stops={mapStops}
              showRoute
              height="320px"
              onAddStopAtPoint={({ lat, lon, timestamp }) => {
                setAddStopFromMap({ lat, lon });
                setAddStopTime(toDatetimeLocal(timestamp));
                setAddStopModalOpen(true);
              }}
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
          </div>
        </section>
      )}

      <section className="page-section">
        <h3 className="page-heading">Location records</h3>
        <ul className="trip-location-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {locationRecords.map((rec, i) => (
            <li key={rec.type === 'stop' && rec.stopId ? rec.stopId : `${rec.type}-${i}`} className="trip-location-record">
              <span className="trip-location-icon" aria-hidden>
                {rec.type === 'start' ? '🟢' : rec.type === 'end' ? '🔴' : rec.isDetectedStop ? '🟠' : '📍'}
              </span>
              <div className="trip-location-body">
                <div className="trip-location-datetime">{rec.dateTime}</div>
                <div className="trip-location-place">
                  {rec.type === 'start' && 'Start'}
                  {rec.type === 'end' && 'End'}
                  {rec.type === 'stop' && (rec.isDetectedStop && editingDetectedStopId === rec.stopId ? (
                    <input
                      type="text"
                      value={editingDetectedStopLabel}
                      onChange={(e) => setEditingDetectedStopLabel(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameDetectedStop(rec.stopId!, editingDetectedStopLabel)}
                      onBlur={() => editingDetectedStopLabel.trim() && handleRenameDetectedStop(rec.stopId!, editingDetectedStopLabel)}
                      className="input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.9rem' }}
                      autoFocus
                    />
                  ) : (
                    rec.label || 'Stop'
                  ))}
                </div>
                {rec.type === 'stop' && (
                  <div className="trip-stop-meta">
                    {rec.stopSource && (
                      <span className={`trip-stop-chip trip-stop-chip--${rec.stopSource}`}>
                        {rec.stopSource === 'detected' ? 'Auto stop' : 'Manual stop'}
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
                  {rec.lat.toFixed(5)}, {rec.lon.toFixed(5)}
                </div>
              </div>
              {rec.type === 'stop' && rec.stopId && (
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  {rec.isDetectedStop ? (
                    <>
                      {editingDetectedStopId !== rec.stopId ? (
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
                      ) : null}
                      <button type="button" className="btn-link danger" style={{ fontSize: '0.85rem' }} onClick={() => removeDetectedStop(rec.stopId!)}>
                        Remove
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-link danger" onClick={() => removeStop(rec.stopId!)}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {stats && (
        <>
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

      <div style={{ marginTop: '1rem' }}>
        <Link to={`/tracking?deviceId=${encodeURIComponent(vehicle!.deviceId!)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`} className="btn btn-secondary">
          Full tracking view (map + speed chart)
        </Link>
      </div>

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
              <button type="button" className="modal-dialog-close" onClick={() => setSplitModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-dialog-body">
              <p className="card-meta">Split at a time between start and end. Open the first or second segment in the tracking view.</p>
              <label className="form-row">
                <span>Split at</span>
                <input
                  type="datetime-local"
                  value={splitAt}
                  onChange={(e) => setSplitAt(e.target.value)}
                  className="input"
                  min={from.slice(0, 16)}
                  max={to.slice(0, 16)}
                />
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleSplit} disabled={!splitAt}>
                  View first segment
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!splitAt}
                  onClick={() => {
                    if (!splitAt || !vehicle?.deviceId) return;
                    setSplitModalOpen(false);
                    setShowActionsMenu(false);
                    navigate(
                      `/tracking?deviceId=${encodeURIComponent(vehicle.deviceId)}&from=${encodeURIComponent(new Date(splitAt).toISOString())}&to=${encodeURIComponent(to)}`
                    );
                  }}
                >
                  View second segment
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setSplitModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {addStopModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setAddStopModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-stop-title"
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-dialog-header">
              <h3 id="add-stop-title" className="modal-dialog-title">Add stop</h3>
              <button type="button" className="modal-dialog-close" onClick={() => setAddStopModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-dialog-body">
              <p className="card-meta">Pick a time within the trip. The nearest position will be added as a stop (saved in this session only).</p>
              <label className="form-row">
                <span>Time</span>
                <input
                  type="datetime-local"
                  value={addStopTime}
                  onChange={(e) => setAddStopTime(e.target.value)}
                  className="input"
                  min={from.slice(0, 16)}
                  max={to.slice(0, 16)}
                  step="1"
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleAddStop} disabled={!addStopTime}>
                  Add stop
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setAddStopFromMap(null); setAddStopModalOpen(false); }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <button type="button" className="modal-dialog-close" onClick={() => setRenameModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-dialog-body">
              <p className="card-meta">Custom name is stored in this device only. Leave empty to use the default trip ID.</p>
              <label className="form-row">
                <span>Name</span>
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  className="input"
                  placeholder={`Trip ${tripId}`}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleRenameSave}>
                  Save
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setRenameModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
