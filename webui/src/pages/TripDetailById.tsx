import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchTrip, type TripDetailResponse, type TripDetailPosition } from '../api/trips';
import { TrackMap } from '../components/TrackMap';
import { SpeedChart } from '../components/SpeedChart';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance, formatSpeed } from '../utils/units';
import { getErrorMessage } from '../utils/getErrorMessage';

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

function formatDurationMs(ms: number): string {
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
  const { preferences } = usePreferences();
  const [data, setData] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    setError(null);
    fetchTrip(tripId)
      .then(setData)
      .catch((e) => setError(getErrorMessage(e, 'Failed to load trip')))
      .finally(() => setLoading(false));
  }, [tripId]);

  const mapPoints = useMemo(() => {
    if (!data?.positions?.length) return [];
    return data.positions.map((p) => ({
      lat: p.latitude,
      lon: p.longitude,
      time: formatDateTime(p.timestamp),
      label: undefined,
    }));
  }, [data?.positions]);

  const durationMs = useMemo(() => {
    if (!data?.trip) return 0;
    return new Date(data.trip.endTime).getTime() - new Date(data.trip.startTime).getTime();
  }, [data?.trip]);

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
  };

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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportGpx}
            disabled={positions.length === 0}
          >
            Export GPX
          </button>
        </div>
      </div>

      {positions.length > 0 && (
        <section className="page-section" style={{ marginBottom: '1rem' }}>
          <div className="tracking-map-wrap">
            <TrackMap positions={mapPoints} showRoute height="320px" />
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
          {positions.length > 0 && (
            <>
              <li className="trip-location-record">
                <span className="trip-location-icon" aria-hidden>🟢</span>
                <div className="trip-location-body">
                  <div className="trip-location-datetime">{formatDateTime(positions[0].timestamp)}</div>
                  <div className="trip-location-place">Start</div>
                  <div className="trip-location-coords muted">
                    {positions[0].latitude.toFixed(5)}, {positions[0].longitude.toFixed(5)}
                  </div>
                </div>
              </li>
              {positions.length > 1 && (
                <li className="trip-location-record">
                  <span className="trip-location-icon" aria-hidden>🔴</span>
                  <div className="trip-location-body">
                    <div className="trip-location-datetime">{formatDateTime(positions[positions.length - 1].timestamp)}</div>
                    <div className="trip-location-place">End</div>
                    <div className="trip-location-coords muted">
                      {positions[positions.length - 1].latitude.toFixed(5)}, {positions[positions.length - 1].longitude.toFixed(5)}
                    </div>
                  </div>
                </li>
              )}
            </>
          )}
          {positions.length === 0 && <li className="muted">No positions</li>}
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
    </div>
  );
}
