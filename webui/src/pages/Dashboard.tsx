import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDevices, type Device } from '../api/devices';
import { fetchLatestPositions, type Position } from '../api/positions';
import { fetchVehicles, type VehiclesResponse } from '../api/vehicles';
import { fetchTrips, type TripListItem } from '../api/trips';
import { fetchMaintenanceRecent, type MaintenanceRecord } from '../api/maintenance';
import { TrackMap } from '../components/TrackMap';
import { getErrorMessage } from '../utils/getErrorMessage';
import { extractTelemetry } from '../utils/telemetry';

interface LatestPositionRow {
  device: Device;
  position: Position;
}

function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function deviceLabel(device: Device): string {
  return device.name?.trim() || device.imei;
}

function formatRelativeTime(iso: string): string {
  try {
    const deltaMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.round(deltaMs / (60 * 1000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } catch {
    return formatTime(iso);
  }
}

/** Heading in degrees from position attributes (e.g. OsmAnd/Traccar). */
function getCourse(position: Position): number | undefined {
  const attrs = position.attributes as Record<string, unknown> | undefined;
  if (!attrs) return undefined;
  const h = attrs.heading ?? attrs.course;
  if (typeof h === 'number' && h >= 0 && h <= 360) return h;
  return undefined;
}

export function Dashboard() {
  const [rows, setRows] = useState<LatestPositionRow[]>([]);
  const [vehiclesRes, setVehiclesRes] = useState<VehiclesResponse | null>(null);
  const [recentTrips, setRecentTrips] = useState<TripListItem[]>([]);
  const [tripsTotal, setTripsTotal] = useState(0);
  const [recentMaintenance, setRecentMaintenance] = useState<MaintenanceRecord[]>([]);
  const [maintenanceTotal, setMaintenanceTotal] = useState(0);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchVehicles({ page: 1, limit: 1 }),
      fetchTrips({ page: 1, limit: 5 }),
      fetchMaintenanceRecent({ page: 1, limit: 5 }),
      fetchDevices({ page: 1, limit: 100 }),
    ])
      .then(([vRes, tRes, mRes, dRes]) => {
        setVehiclesRes(vRes);
        setRecentTrips(tRes.data);
        setTripsTotal(tRes.pagination.total);
        setRecentMaintenance(mRes.data);
        setMaintenanceTotal(mRes.pagination.total);
        setDeviceCount(dRes.pagination?.total ?? 0);
        if (dRes.data.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }
        return Promise.all(
          dRes.data.map(async (device) => {
            const { positions } = await fetchLatestPositions(device.id, 1);
            return positions[0] ? { device, position: positions[0] } : null;
          })
        ).then((results) => {
          const withPosition = results.filter(
            (r): r is LatestPositionRow => r != null
          );
          withPosition.sort(
            (a, b) =>
              new Date(b.position.timestamp).getTime() -
              new Date(a.position.timestamp).getTime()
          );
          setRows(withPosition);
        });
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load overview')))
      .finally(() => setLoading(false));
  }, []);

  const mapPoints = rows.map(({ device, position }) => ({
    lat: position.latitude,
    lon: position.longitude,
    label: deviceLabel(device),
    time: formatTime(position.timestamp),
    course: getCourse(position),
  }));

  const vehicleCount = vehiclesRes?.pagination?.total ?? 0;
  const latestRow = rows[0] ?? null;
  const latestTelemetry = latestRow ? extractTelemetry(latestRow.position.attributes) : null;
  const overviewHighlights = [
    latestRow ? {
      label: 'Latest tracker',
      value: deviceLabel(latestRow.device),
      meta: `${formatRelativeTime(latestRow.position.timestamp)} · ${formatCoords(latestRow.position.latitude, latestRow.position.longitude)}`,
    } : null,
    recentTrips[0] ? {
      label: 'Latest trip',
      value: recentTrips[0].vehicle?.name ?? recentTrips[0].device?.name ?? 'Trip',
      meta: formatDate(recentTrips[0].startTime),
    } : null,
    recentMaintenance[0] ? {
      label: 'Recent service',
      value: recentMaintenance[0].vehicleName ?? 'Maintenance',
      meta: `${recentMaintenance[0].type} · ${formatDate(recentMaintenance[0].date)}`,
    } : null,
    latestTelemetry?.ignition != null ? {
      label: 'Ignition',
      value: latestTelemetry.ignition ? 'On' : 'Off',
      meta: latestTelemetry.batteryPercent != null ? `Battery ${Math.round(latestTelemetry.batteryPercent * 100)}%` : 'Live telemetry available',
    } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; meta: string }>;

  const isEmpty = !loading && !error && vehicleCount === 0 && tripsTotal === 0 && rows.length === 0 && maintenanceTotal === 0;

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Overview</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : (
          <>
            {isEmpty && (
              <p className="dashboard-empty-hint">
                Get started by <Link to="/vehicles">adding a vehicle</Link> and a <Link to="/devices">device</Link>, or <Link to="/trips">import a trip</Link>.
              </p>
            )}
            <div className="dashboard-overview-shell">
              <div className="dashboard-overview-hero">
                <div className="dashboard-overview-copy">
                  <span className="dashboard-overview-kicker">Fleet overview</span>
                  <h3 className="dashboard-overview-title">Live fleet snapshot</h3>
                </div>
                {overviewHighlights.length > 0 && (
                  <div className="dashboard-overview-highlights">
                    {overviewHighlights.map((item) => (
                      <div key={item.label} className="dashboard-overview-highlight">
                        <span className="dashboard-overview-highlight-label">{item.label}</span>
                        <strong className="dashboard-overview-highlight-value">{item.value}</strong>
                        <span className="dashboard-overview-highlight-meta">{item.meta}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="dashboard-summary">
                <Link to="/vehicles" className="dashboard-stat">
                  <span className="dashboard-stat-value">{vehicleCount}</span>
                  <span className="dashboard-stat-label">Vehicles</span>
                </Link>
                <Link to="/trips" className="dashboard-stat">
                  <span className="dashboard-stat-value">{tripsTotal}</span>
                  <span className="dashboard-stat-label">Trips</span>
                </Link>
                <Link to="/devices" className="dashboard-stat">
                  <span className="dashboard-stat-value">{deviceCount}</span>
                  <span className="dashboard-stat-label">Devices</span>
                </Link>
                <Link to="/tracking" className="dashboard-stat">
                  <span className="dashboard-stat-value">{rows.length}</span>
                  <span className="dashboard-stat-label">With position</span>
                </Link>
                <Link to="/maintenance" className="dashboard-stat">
                  <span className="dashboard-stat-value">{maintenanceTotal}</span>
                  <span className="dashboard-stat-label">Maintenance</span>
                </Link>
              </div>
            </div>

            {mapPoints.length > 0 && (
              <div className="dashboard-map-card card">
                <div className="dashboard-card-header">
                  <h3 className="card-title">
                    <Link to="/tracking" className="dashboard-card-title-link">Device positions</Link>
                  </h3>
                  <Link to="/tracking" className="btn-link btn-link-sm">View on Tracking →</Link>
                </div>
                <p className="card-meta dashboard-card-meta">
                  Latest known locations across active trackers for a quick fleet-health scan.
                </p>
                <TrackMap
                  positions={mapPoints}
                  showRoute={false}
                  height="220px"
                  className="overview-map"
                />
              </div>
            )}

            <div className="dashboard-grid">
              <div className="dashboard-block card">
                <div className="dashboard-card-header">
                  <h3 className="card-title">
                    <Link to="/trips" className="dashboard-card-title-link">Recent trips</Link>
                  </h3>
                  {tripsTotal > 0 && (
                    <Link to="/trips" className="btn-link btn-link-sm">All trips →</Link>
                  )}
                </div>
                {recentTrips.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No trips yet. <Link to="/trips">View trips</Link> or import one.</p>
                ) : (
                  <ul className="list" style={{ margin: 0 }}>
                    {recentTrips.map((t) => (
                      <li key={t.id} className="list-item">
                        <Link to={`/trips/${t.id}`} className="list-item-main list-item-link">
                          {t.vehicle?.name ?? t.device?.name ?? 'Trip'} — {formatDate(t.startTime)}
                        </Link>
                        <span className="list-item-meta muted">{formatTime(t.startTime)} · {t.source}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {recentTrips.length > 0 && tripsTotal > 5 && (
                  <Link to="/trips" className="btn-link dashboard-block-footer">View all {tripsTotal} trips →</Link>
                )}
              </div>

              <div className="dashboard-block card">
                <div className="dashboard-card-header">
                  <h3 className="card-title">
                    <Link to="/tracking" className="dashboard-card-title-link">Latest positions</Link>
                  </h3>
                  {rows.length > 0 && (
                    <Link to="/tracking" className="btn-link btn-link-sm">Tracking →</Link>
                  )}
                </div>
                {rows.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No position data yet. <Link to="/tracking">Open Tracking</Link> to see history.</p>
                ) : (
                  <ul className="list" style={{ margin: 0 }}>
                    {rows.map(({ device, position }) => (
                      <li key={`${device.id}-${position.id}`} className="list-item">
                        <Link to={`/tracking?deviceId=${encodeURIComponent(device.id)}`} className="list-item-main list-item-link">
                          <strong>{deviceLabel(device)}</strong>
                          <span className="muted"> — {formatCoords(position.latitude, position.longitude)}</span>
                        </Link>
                        <span className="list-item-meta">{formatRelativeTime(position.timestamp)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {rows.length > 0 && (
                  <Link to="/tracking" className="btn-link dashboard-block-footer">View on Tracking →</Link>
                )}
              </div>

              <div className="dashboard-block card">
                <div className="dashboard-card-header">
                  <h3 className="card-title">
                    <Link to="/maintenance" className="dashboard-card-title-link">Recent maintenance</Link>
                  </h3>
                  {maintenanceTotal > 0 && (
                    <Link to="/maintenance" className="btn-link btn-link-sm">All →</Link>
                  )}
                </div>
                {recentMaintenance.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No maintenance records yet. <Link to="/maintenance">Add one</Link>.</p>
                ) : (
                  <ul className="list" style={{ margin: 0 }}>
                    {recentMaintenance.map((r) => (
                      <li key={r.id} className="list-item">
                        <Link to={`/maintenance?vehicleId=${encodeURIComponent(r.vehicleId)}`} className="list-item-main list-item-link">
                          <strong>{r.vehicleName ?? 'Vehicle'}</strong> — {r.type} · {formatDate(r.date)}
                        </Link>
                        <span className="list-item-meta muted">{r.notes ? `${r.notes.slice(0, 30)}${r.notes.length > 30 ? '…' : ''}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {recentMaintenance.length > 0 && maintenanceTotal > 5 && (
                  <Link to="/maintenance" className="btn-link dashboard-block-footer">View all {maintenanceTotal} records →</Link>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
