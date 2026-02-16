import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDevices, type Device } from '../api/devices';
import { fetchLatestPositions, type Position } from '../api/positions';
import { fetchVehicles, type VehiclesResponse } from '../api/vehicles';
import { fetchTrips, type TripListItem } from '../api/trips';
import { fetchMaintenanceRecent, type MaintenanceRecord } from '../api/maintenance';
import { TrackMap } from '../components/TrackMap';
import { getErrorMessage } from '../utils/getErrorMessage';

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
  const deviceCount = vehiclesRes ? rows.length : 0; // devices with position; we could show total devices from another fetch

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Overview</h2>
        <p className="page-subheading">
          Summary of vehicles, trips, and device positions. Map shows direction of movement when reported by the device.
        </p>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : (
          <>
            <div className="dashboard-summary">
              <Link to="/vehicles" className="dashboard-stat" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="dashboard-stat-value">{vehicleCount}</span>
                <span className="dashboard-stat-label">Vehicles</span>
              </Link>
              <Link to="/trips" className="dashboard-stat" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="dashboard-stat-value">{tripsTotal}</span>
                <span className="dashboard-stat-label">Trips</span>
              </Link>
              <Link to="/tracking" className="dashboard-stat" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="dashboard-stat-value">{rows.length}</span>
                <span className="dashboard-stat-label">Devices with position</span>
              </Link>
              <Link to="/maintenance" className="dashboard-stat" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="dashboard-stat-value">{maintenanceTotal}</span>
                <span className="dashboard-stat-label">Maintenance</span>
              </Link>
            </div>

            {mapPoints.length > 0 && (
              <div className="dashboard-map-card card">
                <h3 className="card-title">Device positions</h3>
                <p className="card-meta" style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  Arrows show direction of movement when the device sends heading (e.g. OsmAnd / Traccar).
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
                <h3 className="card-title">Recent trips</h3>
                {recentTrips.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No trips yet.</p>
                ) : (
                  <ul className="list" style={{ margin: 0 }}>
                    {recentTrips.map((t) => (
                      <li key={t.id} className="list-item">
                        <Link to={`/trips/${t.id}`} className="list-item-main" style={{ textDecoration: 'none', color: 'inherit' }}>
                          {t.vehicle?.name ?? t.device?.name ?? 'Trip'} — {formatDate(t.startTime)}
                        </Link>
                        <span className="list-item-meta muted">{formatTime(t.startTime)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {tripsTotal > 5 && (
                  <Link to="/trips" className="btn-link" style={{ marginTop: '0.5rem', display: 'inline-block' }}>View all trips →</Link>
                )}
              </div>

              <div className="dashboard-block card">
                <h3 className="card-title">Latest positions</h3>
                {rows.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No position data yet.</p>
                ) : (
                  <ul className="list" style={{ margin: 0 }}>
                    {rows.map(({ device, position }) => (
                      <li key={`${device.id}-${position.id}`} className="list-item">
                        <div className="list-item-main">
                          <strong>{deviceLabel(device)}</strong>
                          <span className="muted"> — {formatCoords(position.latitude, position.longitude)}</span>
                        </div>
                        <div className="list-item-meta">{formatTime(position.timestamp)}</div>
                      </li>
                    ))}
                  </ul>
                )}
                {rows.length > 0 && (
                  <Link to="/tracking" className="btn-link" style={{ marginTop: '0.5rem', display: 'inline-block' }}>Tracking →</Link>
                )}
              </div>

              <div className="dashboard-block card">
                <h3 className="card-title">Recent maintenance</h3>
                {recentMaintenance.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No maintenance records yet.</p>
                ) : (
                  <ul className="list" style={{ margin: 0 }}>
                    {recentMaintenance.map((r) => (
                      <li key={r.id} className="list-item">
                        <span className="list-item-main">
                          <strong>{r.vehicleName ?? 'Vehicle'}</strong> — {r.type} · {formatDate(r.date)}
                        </span>
                        <span className="list-item-meta muted">{r.notes ? `${r.notes.slice(0, 30)}${r.notes.length > 30 ? '…' : ''}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {maintenanceTotal > 5 && (
                  <Link to="/maintenance" className="btn-link" style={{ marginTop: '0.5rem', display: 'inline-block' }}>View all maintenance →</Link>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
