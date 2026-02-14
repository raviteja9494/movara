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
import { SpeedChart } from '../components/SpeedChart';
import { getErrorMessage } from '../utils/getErrorMessage';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance, formatSpeed } from '../utils/units';

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={spinning ? 'tracking-refresh-icon spinning' : 'tracking-refresh-icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

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
  const { preferences } = usePreferences();
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
  const [plotParams, setPlotParams] = useState<{ speed: boolean; altitude: boolean; battery: boolean }>({
    speed: true,
    altitude: false,
    battery: false,
  });

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
    if (qDeviceId && devices.some((d) => d.id === qDeviceId) && qFrom && qTo) {
      setDeviceId(qDeviceId);
      setUseCustomRange(true);
      setCustomFrom(toDatetimeLocal(qFrom));
      setCustomTo(toDatetimeLocal(qTo));
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

        <div className="tracking-toolbar">
          <div className="tracking-toolbar-row">
            <label className="tracking-field">
              <span className="tracking-field-label">Device</span>
              <select
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  setError(null);
                }}
                className="input tracking-select"
              >
                <option value="">Select device</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {deviceLabel(d)} ({d.imei})
                  </option>
                ))}
              </select>
            </label>
            <label className="tracking-field">
              <span className="tracking-field-label">Time range</span>
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
                className="input tracking-select"
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
                <label className="tracking-field">
                  <span className="tracking-field-label">From</span>
                  <input
                    type="datetime-local"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="input"
                  />
                </label>
                <label className="tracking-field">
                  <span className="tracking-field-label">To</span>
                  <input
                    type="datetime-local"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="input"
                  />
                </label>
              </>
            )}
            <div className="tracking-actions">
              <button
                type="button"
                className="tracking-refresh-btn"
                onClick={load}
                disabled={loading || !deviceId}
                aria-label={loading ? 'Loading' : 'Refresh'}
                title={loading ? 'Loading…' : 'Refresh'}
              >
                <RefreshIcon spinning={loading} />
              </button>
              <button
                type="button"
                className={`tracking-live-toggle ${live ? 'tracking-live-on' : ''}`}
                onClick={() => deviceId && setLive((v) => !v)}
                disabled={!deviceId}
                aria-pressed={live}
                title="Live updates every 5s"
              >
                <span className="tracking-live-dot" aria-hidden />
                <span className="tracking-live-label">Live</span>
              </button>
            </div>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

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
                label: selectedDevice ? deviceLabel(selectedDevice) : undefined,
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
            {stats && (
              <div className="stats-bar tracking-stats-bar" style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <span><strong>Odometer:</strong> {formatDistance(stats.odometerKm, preferences.distanceUnit)}</span>
                <span><strong>Max speed:</strong> {formatSpeed(stats.maxSpeedKmh, preferences.distanceUnit)}</span>
                <span><strong>Avg speed:</strong> {formatSpeed(stats.avgSpeedKmh, preferences.distanceUnit)}</span>
                <span><strong>Points:</strong> {stats.pointCount}</span>
              </div>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <div className="speed-chart-options" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <span className="muted" style={{ fontSize: '0.9rem' }}>Plot:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={plotParams.speed}
                    onChange={(e) => setPlotParams((p) => ({ ...p, speed: e.target.checked }))}
                  />
                  Speed
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={plotParams.altitude}
                    onChange={(e) => setPlotParams((p) => ({ ...p, altitude: e.target.checked }))}
                  />
                  Altitude
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={plotParams.battery}
                    onChange={(e) => setPlotParams((p) => ({ ...p, battery: e.target.checked }))}
                  />
                  Battery %
                </label>
              </div>
              <SpeedChart
                positions={positions}
                speedUnit={preferences.distanceUnit === 'mi' ? 'mph' : 'km/h'}
                useMph={preferences.distanceUnit === 'mi'}
                plotSpeed={plotParams.speed}
                plotAltitude={plotParams.altitude}
                plotBattery={plotParams.battery}
              />
            </div>
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
                        <th>Speed</th>
                        <th>Extras (OsmAnd)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.slice(0, POSITION_TABLE_LIMIT).map((p) => (
                        <tr key={p.id}>
                          <td>{formatTime(p.timestamp)}</td>
                          <td>{p.latitude.toFixed(5)}</td>
                          <td>{p.longitude.toFixed(5)}</td>
                          <td>{p.speed != null ? formatSpeed(p.speed, preferences.distanceUnit) : '—'}</td>
                          <td className="position-extras">
                            {p.attributes && Object.keys(p.attributes).length > 0 ? (
                              <span title={JSON.stringify(p.attributes, null, 2)}>
                                {[
                                  p.attributes.battery_level != null && `${Number(p.attributes.battery_level) * 100}% bat`,
                                  p.attributes.accuracy != null && `${p.attributes.accuracy}m`,
                                  p.attributes.altitude != null && `${p.attributes.altitude}m alt`,
                                  p.attributes.activity_type && String(p.attributes.activity_type),
                                  p.attributes.is_moving !== undefined && (p.attributes.is_moving ? 'moving' : 'still'),
                                ].filter(Boolean).join(' · ')}
                              </span>
                            ) : '—'}
                          </td>
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
