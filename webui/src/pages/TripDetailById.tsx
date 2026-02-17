import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchTrip, updateTrip, splitTrip, type TripDetailResponse, type TripDetailPosition } from '../api/trips';
import { fetchFuelRecords, type FuelRecord } from '../api/vehicles';
import { TrackMap, type MapStop } from '../components/TrackMap';
import { SpeedChart } from '../components/SpeedChart';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance, formatSpeed } from '../utils/units';
import { getErrorMessage } from '../utils/getErrorMessage';

interface AddedStop {
  id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  label: string;
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

/** Format ISO string for datetime-local input (local time) */
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

/** Bearing in degrees (0 = north) from point a to point b. */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1r = (lat1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} min`;
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
  const [addStopName, setAddStopName] = useState('');
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editingStopLabel, setEditingStopLabel] = useState('');
  const [editTimesModalOpen, setEditTimesModalOpen] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [addedStops, setAddedStops] = useState<AddedStop[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);

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
    return sorted.map((p, i) => {
      let course: number | undefined;
      if (sorted.length >= 2) {
        if (i === 0) {
          course = bearingDeg(p.latitude, p.longitude, sorted[1].latitude, sorted[1].longitude);
        } else if (i === sorted.length - 1) {
          course = bearingDeg(sorted[i - 1].latitude, sorted[i - 1].longitude, p.latitude, p.longitude);
        } else {
          course = bearingDeg(sorted[i - 1].latitude, sorted[i - 1].longitude, p.latitude, p.longitude);
        }
      }
      return {
        lat: p.latitude,
        lon: p.longitude,
        time: formatDateTime(p.timestamp),
        label: undefined,
        course,
      };
    });
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
      attributes: undefined,
    }));
  }, [data?.positions, data?.trip?.deviceId]);

  const tripStartMs = data?.trip ? new Date(data.trip.startTime).getTime() : 0;
  const tripEndMs = data?.trip ? new Date(data.trip.endTime).getTime() : 0;
  const fuelStopsInTrip = useMemo(() => {
    if (!data?.trip || !fuelRecords.length) return [];
    return fuelRecords.filter((f) => {
      if (f.latitude == null || f.longitude == null) return false;
      const t = new Date(f.date).getTime();
      return t >= tripStartMs && t <= tripEndMs;
    });
  }, [data?.trip, fuelRecords, tripStartMs, tripEndMs]);

  const mapStops = useMemo((): MapStop[] => {
    const stops: MapStop[] = fuelStopsInTrip.map((f) => ({
      lat: f.latitude!,
      lon: f.longitude!,
      label: `Fuel · ${formatDateTime(f.date)}`,
    }));
    addedStops.forEach((s) => stops.push({ lat: s.latitude, lon: s.longitude, label: s.label }));
    return stops;
  }, [fuelStopsInTrip, addedStops]);

  const locationRecords = useMemo(() => {
    const records: Array<{ type: string; dateTime: string; lat?: number; lon?: number; label?: string; stopId?: string }> = [];
    if (!data?.trip) return records;
    const { trip, positions } = data;
    const hasMultiplePositions = (positions?.length ?? 0) >= 2;
    // Start: use first position time only when we have 2+ positions (so start ≠ end); else use trip.startTime
    const startPos = positions?.length ? positions[0] : null;
    records.push({
      type: 'start',
      dateTime: formatDateTime(hasMultiplePositions && startPos ? startPos.timestamp : trip.startTime),
      lat: startPos?.latitude,
      lon: startPos?.longitude,
    });
    const combinedStops: Array<{ timestamp: string; lat: number; lon: number; label: string; stopId?: string }> = [
      ...fuelStopsInTrip.map((f) => ({
        timestamp: f.date,
        lat: f.latitude!,
        lon: f.longitude!,
        label: `Fuel · ${formatDateTime(f.date)}`,
        stopId: f.id,
      })),
      ...addedStops.map((s) => ({
        timestamp: s.timestamp,
        lat: s.latitude,
        lon: s.longitude,
        label: s.label,
        stopId: s.id,
      })),
    ];
    combinedStops.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    combinedStops.forEach((s) =>
      records.push({ type: 'stop', dateTime: formatDateTime(s.timestamp), lat: s.lat, lon: s.lon, label: s.label, stopId: s.stopId })
    );
    // End: use last position time only when we have 2+ positions; else use trip.endTime (avoids start/end same when 0 or 1 position)
    const endPos = positions?.length ? positions[positions.length - 1] : null;
    records.push({
      type: 'end',
      dateTime: formatDateTime(hasMultiplePositions && endPos ? endPos.timestamp : trip.endTime),
      lat: endPos?.latitude,
      lon: endPos?.longitude,
    });
    return records;
  }, [data?.positions, data?.trip, fuelStopsInTrip, addedStops]);

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
    const t = new Date(splitAt).getTime();
    if (t <= startT || t >= endT) return;
    splitTrip(tripId, { splitAt: new Date(splitAt).toISOString() })
      .then((r) => {
        setSplitModalOpen(false);
        setShowActionsMenu(false);
        navigate(r.trips[0] ? `/trips/${r.trips[0].id}` : '/trips');
      })
      .catch(() => {});
  };

  const handleAddStop = () => {
    if (!addStopTime || !data?.positions?.length) return;
    const target = new Date(addStopTime).getTime();
    let best = data.positions[0];
    let bestDiff = Math.abs(new Date(best.timestamp).getTime() - target);
    for (let i = 1; i < data.positions.length; i++) {
      const diff = Math.abs(new Date(data.positions[i].timestamp).getTime() - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = data.positions[i];
      }
    }
    const name = addStopName.trim() || `Stop ${addedStops.length + 1}`;
    setAddedStops((prev) => [
      ...prev,
      {
        id: `stop-${Date.now()}`,
        timestamp: best.timestamp,
        latitude: best.latitude,
        longitude: best.longitude,
        label: name,
      },
    ]);
    setAddStopTime('');
    setAddStopName('');
    setAddStopModalOpen(false);
  };

  const isAddedStop = (stopId: string | undefined) => stopId != null && addedStops.some((s) => s.id === stopId);

  const handleRenameStop = (stopId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setAddedStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, label: trimmed } : s)));
    setEditingStopId(null);
    setEditingStopLabel('');
  };

  const handleEditTimesSave = () => {
    if (!tripId || !editStartTime || !editEndTime) return;
    const start = new Date(editStartTime).getTime();
    const end = new Date(editEndTime).getTime();
    if (end <= start) return;
    updateTrip(tripId, {
      startTime: new Date(editStartTime).toISOString(),
      endTime: new Date(editEndTime).toISOString(),
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

  const { trip, positions, stats } = data;
  const title = trip.name || `${trip.vehicle?.name ?? 'Trip'} · ${formatDateTime(trip.startTime)}`;

  const handleExportGpx = () => {
    if (positions.length === 0) return;
    downloadGpx(positions, title, trip.id);
    setShowActionsMenu(false);
  };

  const splitMin = trip.startTime.slice(0, 16);
  const splitMax = trip.endTime.slice(0, 16);

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
        <div className="trip-detail-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                      setEditStartTime(toDatetimeLocal(trip.startTime));
                      setEditEndTime(toDatetimeLocal(trip.endTime));
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
                      setAddStopTime(trip.startTime.slice(0, 16));
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
            <TrackMap positions={mapPoints} stops={mapStops} showRoute height="320px" />
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
          {locationRecords.length > 0 ? (
            locationRecords.map((rec, i) => {
              const isAdded = rec.type === 'stop' && isAddedStop(rec.stopId);
              const isEditing = rec.stopId != null && editingStopId === rec.stopId;
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
                      ) : isEditing ? (
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
                      ) : (
                        <>
                          {rec.label ?? 'Stop'}
                          {isAdded && (
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
                          )}
                        </>
                      )}
                    </div>
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
          onClick={(e) => e.target === e.currentTarget && setAddStopModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-stop-title"
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-dialog-header">
              <h3 id="add-stop-title" className="modal-dialog-title">Add stop</h3>
              <button type="button" className="modal-dialog-close" onClick={() => setAddStopModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-dialog-body">
              <p className="card-meta">Pick a time within the trip. The nearest position is added as a stop (this session only). You can name it now or rename it later in the list.</p>
              <label className="form-row">
                <span>Time</span>
                <input
                  type="datetime-local"
                  value={addStopTime}
                  onChange={(e) => setAddStopTime(e.target.value)}
                  className="input"
                  min={splitMin}
                  max={splitMax}
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
                <button type="button" className="btn btn-secondary" onClick={() => setAddStopModalOpen(false)}>
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
