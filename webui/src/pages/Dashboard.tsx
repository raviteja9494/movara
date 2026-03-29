import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDevices, type Device } from '../api/devices';
import { fetchLatestPositions, type Position } from '../api/positions';
import { fetchVehicles, type VehiclesResponse } from '../api/vehicles';
import { fetchTrips, type TripListItem } from '../api/trips';
import { fetchMaintenanceRecent } from '../api/maintenance';
import { TrackMap } from '../components/TrackMap';
import { getErrorMessage } from '../utils/getErrorMessage';

interface LatestPositionRow {
  device: Device;
  position: Position;
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
    const seconds = Math.max(0, Math.round(deltaMs / 1000));
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.round(deltaMs / (60 * 1000));
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } catch {
    return formatTime(iso);
  }
}

function getCourse(position: Position): number | undefined {
  const attrs = position.attributes as Record<string, unknown> | undefined;
  if (!attrs) return undefined;
  const h = attrs.heading ?? attrs.course;
  if (typeof h === 'number' && h >= 0 && h <= 360) return h;
  return undefined;
}

export function Dashboard() {
  const [rows, setRows] = useState<LatestPositionRow[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [vehiclesRes, setVehiclesRes] = useState<VehiclesResponse | null>(null);
  const [recentTrips, setRecentTrips] = useState<TripListItem[]>([]);
  const [tripsTotal, setTripsTotal] = useState(0);
  const [maintenanceTotal, setMaintenanceTotal] = useState(0);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const loadOverview = useCallback((silent = false) => {
    if (!silent || !initialized) {
      setLoading(true);
    }
    if (!silent) {
      setError(null);
    }

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
        setMaintenanceTotal(mRes.pagination.total);
        setDeviceCount(dRes.pagination?.total ?? 0);
        setDevices(dRes.data);

        if (dRes.data.length === 0) {
          setRows([]);
          return;
        }

        return Promise.all(
          dRes.data.map(async (device) => {
            const { positions } = await fetchLatestPositions(device.id, 1);
            return positions[0] ? { device, position: positions[0] } : null;
          }),
        ).then((results) => {
          const withPosition = results.filter((r): r is LatestPositionRow => r != null);
          withPosition.sort(
            (a, b) =>
              new Date(b.position.timestamp).getTime() -
              new Date(a.position.timestamp).getTime(),
          );
          setRows(withPosition);
        });
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load overview')))
      .finally(() => {
        setLoading(false);
        setInitialized(true);
      });
  }, [initialized]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const interval = setInterval(() => loadOverview(true), 15000);
    return () => clearInterval(interval);
  }, [loadOverview]);

  const mapPoints = rows.map(({ device, position }) => ({
    lat: position.latitude,
    lon: position.longitude,
    label: deviceLabel(device),
    time: formatTime(position.timestamp),
    course: getCourse(position),
  }));

  const vehicleCount = vehiclesRes?.pagination?.total ?? 0;
  const latestRow = rows[0] ?? null;
  const devicesWithoutPosition = devices.filter((device) => !rows.some((row) => row.device.id === device.id));
  const isEmpty =
    !loading &&
    !error &&
    vehicleCount === 0 &&
    tripsTotal === 0 &&
    rows.length === 0 &&
    maintenanceTotal === 0;

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Overview</h2>
        {loading ? (
          <p className="muted">Loading...</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : (
          <>
            {isEmpty && (
              <p className="dashboard-empty-hint">
                Get started by <Link to="/vehicles">adding a vehicle</Link> and a{' '}
                <Link to="/devices">device</Link>, or <Link to="/trips">import a trip</Link>.
              </p>
            )}

            <div className="dashboard-overview-shell">
              <div className="dashboard-overview-hero">
                <div className="dashboard-overview-copy">
                  <span className="dashboard-overview-kicker">Overview</span>
                  <h3 className="dashboard-overview-title">Live fleet snapshot</h3>
                  <p className="dashboard-overview-text" style={{ margin: 0 }}>
                    {latestRow
                      ? `${deviceLabel(latestRow.device)} · ${formatRelativeTime(latestRow.position.timestamp)}`
                      : 'Live tracker summary'}
                  </p>
                </div>
              </div>

              <div className="dashboard-summary">
                <Link to="/vehicles" className="dashboard-stat">
                  <span className="dashboard-stat-value">{vehicleCount}</span>
                  <span className="dashboard-stat-label">Vehicles</span>
                </Link>
                <Link to="/devices" className="dashboard-stat">
                  <span className="dashboard-stat-value">{deviceCount}</span>
                  <span className="dashboard-stat-label">Devices</span>
                </Link>
                <Link to="/tracking" className="dashboard-stat">
                  <span className="dashboard-stat-value">{rows.length}</span>
                  <span className="dashboard-stat-label">Located</span>
                </Link>
                <Link to="/trips" className="dashboard-stat">
                  <span className="dashboard-stat-value">{tripsTotal}</span>
                  <span className="dashboard-stat-label">Trips</span>
                </Link>
              </div>
            </div>

            {mapPoints.length > 0 && (
              <div className="dashboard-map-card card">
                <div className="dashboard-card-header">
                  <h3 className="card-title">
                    <Link to="/tracking" className="dashboard-card-title-link">Live map</Link>
                  </h3>
                  <Link to="/tracking" className="btn-link btn-link-sm">Tracking →</Link>
                </div>
                <p className="card-meta dashboard-card-meta">
                  Only devices with a stored GPS location appear on the map.
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
                    <Link to="/devices" className="dashboard-card-title-link">Waiting for location</Link>
                  </h3>
                  <Link to="/devices" className="btn-link btn-link-sm">Devices →</Link>
                </div>
                {devicesWithoutPosition.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    All visible devices already have a saved location.
                  </p>
                ) : (
                  <ul className="list" style={{ margin: 0 }}>
                    {devicesWithoutPosition.slice(0, 5).map((device) => (
                      <li key={device.id} className="list-item">
                        <Link to="/devices" className="list-item-main list-item-link">
                          <strong>{deviceLabel(device)}</strong>
                        </Link>
                        <span className="list-item-meta">
                          {device.status === 'online' ? 'Online' : 'Offline'} · {formatRelativeTime(device.lastSeen ?? device.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="dashboard-block card">
                <div className="dashboard-card-header">
                  <h3 className="card-title">
                    <Link to="/trips" className="dashboard-card-title-link">Recent trips</Link>
                  </h3>
                  {tripsTotal > 0 && (
                    <Link to="/trips" className="btn-link btn-link-sm">Trips →</Link>
                  )}
                </div>
                {recentTrips.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No trips yet. <Link to="/trips">Open trips</Link> to create or import one.
                  </p>
                ) : (
                  <ul className="list" style={{ margin: 0 }}>
                    {recentTrips.map((trip) => (
                      <li key={trip.id} className="list-item">
                        <Link to={`/trips/${trip.id}`} className="list-item-main list-item-link">
                          {trip.favorite ? '★ ' : ''}
                          {trip.vehicle?.name ?? trip.device?.name ?? 'Trip'} — {formatDate(trip.startTime)}
                        </Link>
                        <span className="list-item-meta muted">
                          {formatTime(trip.startTime)} · {trip.source}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
