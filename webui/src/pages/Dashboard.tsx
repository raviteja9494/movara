import { useEffect, useState } from 'react';
import { fetchDevices, type Device } from '../api/devices';
import { fetchLatestPositions, type Position } from '../api/positions';

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

function deviceLabel(device: Device): string {
  return device.name?.trim() || device.imei;
}

export function Dashboard() {
  const [rows, setRows] = useState<LatestPositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDevices({ page: 1, limit: 100 })
      .then((res) => res.data)
      .then((devices) => {
        if (devices.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }
        return Promise.all(
          devices.map(async (device) => {
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
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load positions'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Latest positions</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : rows.length === 0 ? (
          <p className="muted">No position data yet.</p>
        ) : (
          <ul className="list">
            {rows.map(({ device, position }) => (
              <li key={`${device.id}-${position.id}`} className="list-item">
                <div className="list-item-main">
                  <strong>{deviceLabel(device)}</strong>
                  <span className="muted">
                    {' '}
                    — {formatCoords(position.latitude, position.longitude)}
                  </span>
                </div>
                <div className="list-item-meta">{formatTime(position.timestamp)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
