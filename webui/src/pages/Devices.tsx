import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteDevice, fetchDevices, updateDevice, type Device } from '../api/devices';
import { fetchLatestPositions, type Position } from '../api/positions';
import { fetchVehicles, type Vehicle } from '../api/vehicles';
import { getErrorMessage } from '../utils/getErrorMessage';
import { extractTelemetry } from '../utils/telemetry';

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never seen';
  const deltaMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function formatNumber(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toFixed(digits);
}

function getStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function compactDetailRows(rows: Array<{ label: string; value: string }>) {
  return rows.filter((row) => row.value !== '--');
}

function formatAttributeLabel(key: string): string {
  return key
    .replace(/^eelink_/, '')
    .replace(/^gt06_/, 'GT06 ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAttributeValue(value: unknown): string {
  if (value == null) return '--';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}` : '--';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildAttributeRows(attributes: Record<string, unknown>, hiddenKeys: Set<string>) {
  return Object.entries(attributes)
    .filter(([key]) => !hiddenKeys.has(key))
    .map(([key, value]) => ({
      label: formatAttributeLabel(key),
      value: formatAttributeValue(value),
    }))
    .filter((row) => row.value !== '--')
    .sort((left, right) => left.label.localeCompare(right.label));
}

const ATTRIBUTE_KEYS_ALREADY_SUMMARIZED = new Set([
  'ignition',
  'battery_level',
  'battery_voltage',
  'fuel_level',
  'rpm',
  'coolant_temp',
  'charging',
  'battery_charging',
  'gsm_signal_percent',
  'gps_tracking',
  'defense_armed',
  'heartbeat_alarm_code',
  'battery_level_code',
  'gsm_signal_code',
  'gt06_info_subtype',
  'gt06_fence',
  'gt06_status_code',
  'gt06_report_text',
  'gt06_report_fields',
]);

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);
  const [devicePositionById, setDevicePositionById] = useState<Record<string, Position | null | undefined>>({});
  const [deviceDetailLoadingId, setDeviceDetailLoadingId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const loadDevices = (silent = false) => {
    if (!silent || !initialized) {
      setLoading(true);
    }
    if (!silent) {
      setError(null);
    }
    fetchDevices({ page: 1, limit: 100 })
      .then((res) => setDevices(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load devices')))
      .finally(() => {
        setLoading(false);
        setInitialized(true);
      });
  };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadDevices(true), 15000);
    return () => clearInterval(interval);
  }, [initialized]);

  useEffect(() => {
    fetchVehicles({ page: 1, limit: 100 })
      .then((res) => setVehicles(res.data))
      .catch(() => {});
  }, []);

  const startEdit = (d: Device) => {
    setEditingId(d.id);
    setEditName(d.name ?? '');
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setSaveError(null);
  };

  const saveName = async (id: string) => {
    setSaveError(null);
    setSavingId(id);
    const name = editName.trim() || null;
    try {
      await updateDevice(id, { name });
      setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
      setEditingId(null);
      setEditName('');
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Failed to update name'));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (d: Device) => {
    const label = d.name?.trim() || d.imei;
    if (!window.confirm(`Delete device "${label}"? This will also remove all its position history.`)) return;
    setDeleteError(null);
    setDeletingId(d.id);
    try {
      await deleteDevice(d.id);
      setDevices((prev) => prev.filter((dev) => dev.id !== d.id));
      if (editingId === d.id) cancelEdit();
      if (expandedDeviceId === d.id) setExpandedDeviceId(null);
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to delete device'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleDeviceDetails = async (deviceId: string) => {
    setExpandedDeviceId((current) => (current === deviceId ? null : deviceId));
    if (devicePositionById[deviceId] !== undefined) return;
    setDeviceDetailLoadingId(deviceId);
    try {
      const { positions } = await fetchLatestPositions(deviceId, 1);
      setDevicePositionById((prev) => ({ ...prev, [deviceId]: positions[0] ?? null }));
    } catch {
      setDevicePositionById((prev) => ({ ...prev, [deviceId]: null }));
    } finally {
      setDeviceDetailLoadingId((current) => (current === deviceId ? null : current));
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading...</p></div>;
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (devices.length === 0) return <div className="page"><p className="muted">No devices yet.</p></div>;

  const vehicleByDeviceId = (deviceId: string): Vehicle | undefined =>
    vehicles.find((v) => v.deviceId === deviceId);

  return (
    <div className="page">
      <h2 className="page-heading">Devices</h2>
      <p className="page-subheading">Trackers by IMEI. Use <strong>port 5023</strong> for GT06-compatible hardware (TCP), <strong>port 5064</strong> for Eelink / G500M devices (plain TCP), or <strong>port 5055</strong> for OsmAnd / Traccar Client (HTTP). Link a device to a vehicle on the vehicle&apos;s page for trips and fuel.</p>
      {saveError && <p className="form-error">{saveError}</p>}
      {deleteError && <p className="form-error">{deleteError}</p>}

      <ul className="list">
        {devices.map((d) => {
          const linkedVehicle = vehicleByDeviceId(d.id);
          const latestPosition = devicePositionById[d.id] ?? null;
          const liveAttributes = ((d.lastAttributes ?? {}) as Record<string, unknown>);
          const positionAttributes = (((latestPosition?.attributes as Record<string, unknown> | undefined) ?? {}));
          const mergedAttributes = {
            ...liveAttributes,
            ...positionAttributes,
          };
          const telemetry = extractTelemetry(mergedAttributes);
          const liveTelemetry = extractTelemetry(liveAttributes);
          const positionTelemetry = extractTelemetry(positionAttributes);
          const defenseArmed = typeof mergedAttributes.defense_armed === 'boolean' ? mergedAttributes.defense_armed : null;
          const gpsTracking = typeof mergedAttributes.gps_tracking === 'boolean' ? mergedAttributes.gps_tracking : null;
          const heartbeatAlarmCode = typeof mergedAttributes.heartbeat_alarm_code === 'number' ? mergedAttributes.heartbeat_alarm_code : null;
          const batteryLevelCode = typeof mergedAttributes.battery_level_code === 'number' ? mergedAttributes.battery_level_code : null;
          const gsmSignalCode = typeof mergedAttributes.gsm_signal_code === 'number' ? mergedAttributes.gsm_signal_code : null;
          const gt06InfoSubtype = typeof mergedAttributes.gt06_info_subtype === 'string' ? mergedAttributes.gt06_info_subtype : null;
          const gt06Fence = typeof mergedAttributes.gt06_fence === 'string' ? mergedAttributes.gt06_fence : null;
          const gt06StatusCode = typeof mergedAttributes.gt06_status_code === 'string' ? mergedAttributes.gt06_status_code : null;
          const gt06ReportText = typeof mergedAttributes.gt06_report_text === 'string' ? mergedAttributes.gt06_report_text : null;
          const gt06ReportFields = getStringRecord(mergedAttributes.gt06_report_fields);
          const liveAttributeRows = buildAttributeRows(liveAttributes, ATTRIBUTE_KEYS_ALREADY_SUMMARIZED);
          const positionAttributeRows = buildAttributeRows(positionAttributes, ATTRIBUTE_KEYS_ALREADY_SUMMARIZED);
          const mergedAttributeRows = buildAttributeRows(mergedAttributes, ATTRIBUTE_KEYS_ALREADY_SUMMARIZED);
          const isExpanded = expandedDeviceId === d.id;
          const summaryBits = [
            d.status === 'online' ? 'Online' : 'Offline',
            telemetry?.batteryPercent != null ? `Battery ${Math.round(telemetry.batteryPercent * 100)}%` : null,
            telemetry?.charging != null ? (telemetry.charging ? 'Charging' : 'Not charging') : null,
            telemetry?.ignition != null ? `Ignition ${telemetry.ignition ? 'On' : 'Off'}` : null,
            telemetry?.gsmSignalPercent != null ? `Signal ${Math.round(telemetry.gsmSignalPercent * 100)}%` : null,
            formatRelativeTime(d.lastSeen),
          ].filter(Boolean) as string[];
          const detailRows = compactDetailRows([
            { label: 'Last packet', value: formatRelativeTime(d.lastSeen) },
            { label: 'Latest point', value: latestPosition ? formatRelativeTime(latestPosition.timestamp) : '--' },
            { label: 'Coords', value: latestPosition ? formatCoords(latestPosition.latitude, latestPosition.longitude) : '--' },
            { label: 'Speed', value: latestPosition?.speed != null ? `${formatNumber(latestPosition.speed)} km/h` : '--' },
            { label: 'Ignition', value: telemetry?.ignition != null ? (telemetry.ignition ? 'On' : 'Off') : '--' },
            { label: 'Live ignition', value: liveTelemetry?.ignition != null ? (liveTelemetry.ignition ? 'On' : 'Off') : '--' },
            { label: 'Last GPS ignition', value: positionTelemetry?.ignition != null ? (positionTelemetry.ignition ? 'On' : 'Off') : '--' },
            { label: 'Last GPS fix', value: typeof positionAttributes.gps_fix === 'boolean' ? (positionAttributes.gps_fix ? 'Yes' : 'No') : '--' },
            { label: 'Battery', value: telemetry?.batteryPercent != null ? `${Math.round(telemetry.batteryPercent * 100)}%` : '--' },
            { label: 'Voltage', value: telemetry?.batteryVoltage != null ? `${formatNumber(telemetry.batteryVoltage, 1)} V` : '--' },
            { label: 'Fuel', value: telemetry?.fuelLevel != null ? `${Math.round(telemetry.fuelLevel)}%` : '--' },
            { label: 'RPM', value: telemetry?.rpm != null ? `${Math.round(telemetry.rpm)}` : '--' },
            { label: 'Coolant', value: telemetry?.coolantTemp != null ? `${Math.round(telemetry.coolantTemp)} C` : '--' },
            { label: 'Charging', value: telemetry?.charging != null ? (telemetry.charging ? 'Yes' : 'No') : '--' },
            { label: 'Signal', value: telemetry?.gsmSignalPercent != null ? `${Math.round(telemetry.gsmSignalPercent * 100)}%` : '--' },
            { label: 'GPS tracking', value: gpsTracking != null ? (gpsTracking ? 'On' : 'Off') : '--' },
            { label: 'Defense', value: defenseArmed != null ? (defenseArmed ? 'Armed' : 'Disarmed') : '--' },
            { label: 'Battery code', value: batteryLevelCode != null ? `${batteryLevelCode}` : '--' },
            { label: 'Signal code', value: gsmSignalCode != null ? `${gsmSignalCode}` : '--' },
            { label: 'Alarm code', value: heartbeatAlarmCode != null ? `${heartbeatAlarmCode}` : '--' },
            { label: 'Info subtype', value: gt06InfoSubtype ?? '--' },
            { label: 'Fence', value: gt06Fence ?? '--' },
            { label: 'Status code', value: gt06StatusCode ?? '--' },
          ]);

          return (
            <li key={d.id} className="list-item device-list-item">
              <div className="list-item-main device-list-main">
                <div className="device-list-header">
                  <div className="device-list-identity" onClick={() => void handleToggleDeviceDetails(d.id)} style={{ cursor: 'pointer' }}>
                    <span className="list-item-imei">{d.imei}</span>
                    {d.name ? <strong className="device-list-alias">{d.name}</strong> : <span className="device-list-alias muted">No alias</span>}
                    {linkedVehicle && (
                      <span className="device-list-linked">
                        Linked to{' '}
                        <Link to={`/vehicles/${linkedVehicle.id}`} className="btn-link">
                          {linkedVehicle.name}
                        </Link>
                      </span>
                    )}
                  </div>

                  {editingId === d.id ? (
                    <span className="list-item-edit">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Alias (e.g. Truck 01)"
                        className="input-inline"
                        maxLength={255}
                        disabled={savingId === d.id}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveName(d.id);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                      <button type="button" className="btn btn-sm" onClick={() => void saveName(d.id)} disabled={savingId === d.id}>
                        {savingId === d.id ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={cancelEdit} disabled={savingId === d.id}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <div className="device-list-actions">
                      <button type="button" className="btn-link" onClick={() => startEdit(d)}>Rename</button>
                      <button type="button" className="btn-link danger" onClick={() => void handleDelete(d)} disabled={deletingId === d.id}>
                        {deletingId === d.id ? 'Deleting...' : 'Delete'}
                      </button>
                      <button type="button" className="btn-link" onClick={() => void handleToggleDeviceDetails(d.id)}>
                        {isExpanded ? 'Hide details' : 'Show details'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="device-summary-tags">
                  {summaryBits.map((bit, index) => (
                    <span
                      key={`${d.id}-${bit}-${index}`}
                      className={`device-summary-tag${index === 0 ? (d.status === 'online' ? ' is-online' : ' is-offline') : ''}`}
                    >
                      {bit}
                    </span>
                  ))}
                </div>

                {isExpanded && (
                  <div className="card device-detail-card" style={{ marginTop: '0.85rem', padding: '0.9rem' }}>
                    {deviceDetailLoadingId === d.id ? (
                      <p className="muted" style={{ margin: 0 }}>Loading device details...</p>
                    ) : (
                      <>
                        <div className="device-detail-table">
                          {detailRows.map((item) => (
                            <div key={item.label} className="device-detail-row">
                              <div className="device-detail-label">{item.label}</div>
                              <div className="device-detail-value">{item.value}</div>
                            </div>
                          ))}
                        </div>

                        {liveAttributeRows.length > 0 && (
                          <div className="device-report-block">
                            <div className="device-detail-label" style={{ marginTop: 0 }}>Live device attributes</div>
                            <div className="device-detail-table">
                              {liveAttributeRows.map((item) => (
                                <div key={`${d.id}-${item.label}`} className="device-detail-row">
                                  <div className="device-detail-label">{item.label}</div>
                                  <div className="device-detail-value" style={{ wordBreak: 'break-word' }}>{item.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {positionAttributeRows.length > 0 && (
                          <div className="device-report-block">
                            <div className="device-detail-label" style={{ marginTop: 0 }}>Last position attributes</div>
                            <div className="device-detail-table">
                              {positionAttributeRows.map((item) => (
                                <div key={`${d.id}-pos-${item.label}`} className="device-detail-row">
                                  <div className="device-detail-label">{item.label}</div>
                                  <div className="device-detail-value" style={{ wordBreak: 'break-word' }}>{item.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {mergedAttributeRows.length > 0 && (
                          <div className="device-report-block">
                            <div className="device-detail-label" style={{ marginTop: 0 }}>Merged attributes</div>
                            <div className="device-detail-table">
                              {mergedAttributeRows.map((item) => (
                                <div key={`${d.id}-merged-${item.label}`} className="device-detail-row">
                                  <div className="device-detail-label">{item.label}</div>
                                  <div className="device-detail-value" style={{ wordBreak: 'break-word' }}>{item.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(gt06ReportText || gt06ReportFields) && (
                          <div className="device-report-block">
                            <div className="device-detail-label" style={{ marginTop: 0 }}>GT06 report</div>
                            {gt06ReportFields && (
                              <div className="device-report-tags">
                                {Object.entries(gt06ReportFields).map(([key, value]) => (
                                  <span key={key} className="device-summary-tag">
                                    {key.toUpperCase()}: {value || '--'}
                                  </span>
                                ))}
                              </div>
                            )}
                            {gt06ReportText && (
                              <p className="muted device-report-text">{gt06ReportText}</p>
                            )}
                          </div>
                        )}

                        {Object.keys(mergedAttributes).length > 0 && (
                          <div className="device-report-block">
                            <div className="device-detail-label" style={{ marginTop: 0 }}>Raw telemetry</div>
                            <pre
                              style={{
                                margin: 0,
                                padding: '0.85rem',
                                overflow: 'auto',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                background: 'var(--bg, #f7f7f7)',
                                borderRadius: '0.75rem',
                                fontSize: '0.78rem',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                              }}
                            >
                              {JSON.stringify(mergedAttributes, null, 2)}
                            </pre>
                          </div>
                        )}

                        {!latestPosition && (
                          <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                            No stored positions yet for this device.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

    </div>
  );
}
