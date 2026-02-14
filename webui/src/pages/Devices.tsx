import { useEffect, useState } from 'react';
import { fetchDevices, type Device } from '../api/devices';

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDevices({ page: 1, limit: 100 })
      .then((res) => setDevices(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load devices'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (devices.length === 0) return <div className="page"><p className="muted">No devices yet.</p></div>;

  return (
    <div className="page">
      <ul className="list">
        {devices.map((d) => (
          <li key={d.id} className="list-item">
            <div className="list-item-main">
              <strong>{d.imei}</strong>
              {d.name ? <span className="muted"> — {d.name}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
