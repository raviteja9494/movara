import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchDevices, type Device } from '../api/devices';
import {
  fetchPositionStats,
  fetchLatestPositions,
  type Position,
  type PositionStatsResponse,
} from '../api/positions';
import { TrackMap } from '../components/TrackMap';
import { getErrorMessage } from '../utils/getErrorMessage';

const POSITION_TABLE_LIMIT = 50;

const PRESETS: { label: string; minutes: number }[] = [
  { label: 'Last 15 min', minutes: 15 },
  { label: 'Last 1 h', minutes: 60 },
  { label: 'Last 24 h', minutes: 24 * 60 },
  { label: 'Last 7 days', minutes: 7 * 24 * 60 },
];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function deviceLabel(d: Device): string {
  return d.name?.trim() || d.imei;
}

function buildGpx(positions: Position[], deviceName: string): string {
  const trkpts = positions
    .slice()
    .reverse()
    .map(
      (p) =>
        `    <trkpt lat="${p.latitude}" lon="${p.longitude}"><time>${new Date(p.timestamp).toISOString()}</time>${p.speed != null ? `<extensions><speed>${p.speed}</speed></extensions>` : ''}</trkpt>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Movara" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(deviceName)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function downloadGpx(positions: Position[], deviceName: string): void {
  const gpx = buildGpx(positions, deviceName);
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `track-${deviceName.replace(/\s+/g, '-')}-${Date.now()}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

function toDatetimeLocal(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

export function Tracking() {
  const [searchParams] = useSearchParams();
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [presetIndex, setPresetIndex] = useState(0);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [urlParamsApplied, setUrlParamsApplied] = useState(false);
  const [live, setLive] = useState(false);
  const [stats, setStats] = useState<PositionStatsResponse | null>(null);
  const [positionsOnly, setPositionsOnly] = useState<Position[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(true);

  const getFromTo = useCallback((): { from: Date; to: Date } => {
    const to = new Date();
    if (useCustomRange && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    const minutes = PRESETS[presetIndex]?.minutes ?? 60;
    const from = new Date(to.getTime() - minutes * 60 * 1000);
    return { from, to };
  }, [useCustomRange, customFrom, customTo, presetIndex]);

  const load = useCallback(() => {
    if (!deviceId) {
      setStats(null);
      setPositionsOnly(null);
      return;
    }
    setLoading(true);
    setError(null);
    const { from, to } = getFromTo();
    const fromStr = from.toISOString();
    const toStr = to.toISOString();

    fetchPositionStats(deviceId, fromStr, toStr)
      .then((data) => {
        setStats(data);
        setPositionsOnly(null);
      })
      .catch((err) => {
        setError(getErrorMessage(err, 'Failed to load stats'));
        setStats(null);
        fetchLatestPositions(deviceId, {
          from: fromStr,
          to: toStr,
          limit: 500,
        })
          .then((r) => {
            setPositionsOnly(r.positions);
          })
          .catch(() => setPositionsOnly([]))
          .finally(() => setLoading(false));
      })
      .finally(() => setLoading(false));
  }, [deviceId, getFromTo]);

  useEffect(() => {
    fetchDevices({ page: 1, limit: 100 })
      .then((res) => setDevices(res.data))
      .catch(() => setDevices([]));
  }, []);

  useEffect(() => {
    if (urlParamsApplied || devices.length === 0) return;
    const qDeviceId = searchParams.get('deviceId');
    const qFrom = searchParams.get('from');
    const qTo = searchParams.get('to');
    if (qDeviceId && qFrom && qTo) {
      const exists = devices.some((d) => d.id === qDeviceId);
      if (exists) {
        setDeviceId(qDeviceId);
        setUseCustomRange(true);
        setCustomFrom(toDatetimeLocal(qFrom));
        setCustomTo(toDatetimeLocal(qTo));
      }
    }
    setUrlParamsApplied(true);
  }, [searchParams, devices, urlParamsApplied]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!live || !deviceId) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [live, deviceId, load]);

  const positions = stats?.positions ?? positionsOnly ?? [];
  const selectedDevice = devices.find((d) => d.id === deviceId);

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Tracking</h2>
        <p className="page-subheading">Location history by time range; odometer and speed are computed from position data.</p>

        <div className="form-row" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <label>
            Device
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="input"
              style={{ minWidth: '200px', marginLeft: '0.5rem' }}
            >
              <option value="">Select device</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {deviceLabel(d)} ({d.imei})
                </option>
              ))}
            </select>
          </label>
          <label>
            Time range
            <select
              value={useCustomRange ? 'custom' : String(presetIndex)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') {
                  setUseCustomRange(true);
                } else {
                  setUseCustomRange(false);
                  setPresetIndex(Number(v));
                }
              }}
              className="input"
              style={{ marginLeft: '0.5rem' }}
            >
              {PRESETS.map((p, i) => (
                <option key={p.minutes} value={String(i)}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          {useCustomRange && (
            <>
              <label>
                From
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="input"
                  style={{ marginLeft: '0.5rem' }}
                />
              </label>
              <label>
                To
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="input"
                  style={{ marginLeft: '0.5rem' }}
                />
              </label>
            </>
          )}
          <button type="button" className="btn" onClick={load} disabled={loading || !deviceId}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              disabled={!deviceId}
            />
            Live (refresh every 5s)
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        {stats && (
          <div className="stats-bar" style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span><strong>Odometer:</strong> {stats.odometerKm} km</span>
            <span><strong>Max speed:</strong> {stats.maxSpeedKmh} km/h</span>
            <span><strong>Avg speed:</strong> {stats.avgSpeedKmh} km/h</span>
            <span><strong>Points:</strong> {stats.pointCount}</span>
          </div>
        )}

        {selectedDevice && (
          <p className="muted" style={{ marginBottom: '0.5rem' }}>
            {deviceLabel(selectedDevice)} — {positions.length} position(s) in range
            {positions.length > 0 && (
              <>
                {' '}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => downloadGpx(positions, deviceLabel(selectedDevice))}
                >
                  Export GPX
                </button>
              </>
            )}
          </p>
        )}

        {positions.length > 0 && (
          <div className="page-section" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h3 className="page-heading" style={{ fontSize: '0.9rem', margin: 0 }}>Map</h3>
              <span>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${positions[0]?.latitude}&mlon=${positions[0]?.longitude}&zoom=15`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-link"
                >
                  Open in OpenStreetMap
                </a>
              </span>
            </div>
            <TrackMap
              positions={positions.slice().reverse().map((p) => ({
                lat: p.latitude,
                lon: p.longitude,
                time: formatTime(p.timestamp),
              }))}
              showRoute={true}
              height="380px"
            />
          </div>
        )}

        {positions.length === 0 && deviceId && !loading && (
          <p className="muted">No positions in the selected time range.</p>
        )}

        {positions.length > 0 && (
          <div className="page-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={showTable}
                onChange={(e) => setShowTable(e.target.checked)}
              />
              Show position table
            </label>
            {showTable && (
              <>
                {positions.length > POSITION_TABLE_LIMIT && (
                  <p className="card-meta" style={{ marginBottom: '0.5rem' }}>
                    Showing last {POSITION_TABLE_LIMIT} of {positions.length} positions.
                  </p>
                )}
                <div className="table-wrap" style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Latitude</th>
                        <th>Longitude</th>
                        <th>Speed (km/h)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.slice(0, POSITION_TABLE_LIMIT).map((p) => (
                        <tr key={p.id}>
                          <td>{formatTime(p.timestamp)}</td>
                          <td>{p.latitude.toFixed(5)}</td>
                          <td>{p.longitude.toFixed(5)}</td>
                          <td>{p.speed != null ? p.speed.toFixed(1) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
