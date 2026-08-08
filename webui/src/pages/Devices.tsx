import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { createDevice, deleteDevice, fetchDevices, updateDevice, type Device } from '../api/devices';
import { createSavedLocation } from '../api/locations';
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

function compactDetailRows(rows: Array<{ label: string; value: string }>) {
  return rows.filter((row) => row.value !== '--');
}

function formatPacketIdLabel(protocol: Device['protocol'], packetId: string): string {
  if (protocol === 'gt06') {
    switch (packetId) {
      case '0x01':
        return '0x01 Login';
      case '0x13':
        return '0x13 Heartbeat';
      case '0x22':
        return '0x22 GPS';
      case '0x8A':
        return '0x8A Time sync';
      case '0x94':
        return '0x94 Info';
      default:
        return packetId;
    }
  }
  if (protocol === 'eelink') {
    switch (packetId) {
      case '0x01':
        return '0x01 Login';
      case '0x02':
        return '0x02 Compact location';
      case '0x07':
        return '0x07 Status';
      case '0x08':
        return '0x08 Ping';
      case '0x09':
        return '0x09 Unknown / OBD?';
      case '0x80':
        return '0x80 Command response';
      case '0x91':
        return '0x91 LBS';
      default:
        return packetId;
    }
  }
  return packetId;
}

function getPreferredLivePacketId(protocol: Device['protocol']): string | null {
  switch (protocol) {
    case 'gt06':
      return '0x13';
    case 'eelink':
      return '0x07';
    default:
      return null;
  }
}

function getPreferredLiveAttributes(device: Device): Record<string, unknown> {
  const preferredPacketId = getPreferredLivePacketId(device.protocol);
  if (preferredPacketId) {
    const snapshot = device.packetAttributes?.find((entry) => entry.packetId === preferredPacketId);
    if (snapshot?.attributes) return snapshot.attributes;
  }
  return (device.lastAttributes ?? {}) as Record<string, unknown>;
}

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
  const [savingLocationId, setSavingLocationId] = useState<string | null>(null);
  const [showAddDeviceForm, setShowAddDeviceForm] = useState(false);
  const [newDeviceKind, setNewDeviceKind] = useState<'osmand' | 'imei'>('osmand');
  const [newDeviceIdentifier, setNewDeviceIdentifier] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceSecret, setNewDeviceSecret] = useState('');
  const [creatingDevice, setCreatingDevice] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const loadDevices = useCallback((silent = false) => {
    if (!silent || !initializedRef.current) {
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
        initializedRef.current = true;
      });
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    const interval = setInterval(() => loadDevices(true), 15000);
    return () => clearInterval(interval);
  }, [loadDevices]);

  useEffect(() => {
    if (!expandedDeviceId) return;
    let cancelled = false;
    setDeviceDetailLoadingId(expandedDeviceId);
    fetchLatestPositions(expandedDeviceId, 1)
      .then(({ positions }) => {
        if (cancelled) return;
        setDevicePositionById((prev) => ({ ...prev, [expandedDeviceId]: positions[0] ?? null }));
      })
      .catch(() => {
        if (cancelled) return;
        setDevicePositionById((prev) => ({ ...prev, [expandedDeviceId]: null }));
      })
      .finally(() => {
        if (cancelled) return;
        setDeviceDetailLoadingId((current) => (current === expandedDeviceId ? null : current));
      });
    return () => {
      cancelled = true;
    };
  }, [expandedDeviceId, devices]);

  useEffect(() => {
    fetchVehicles({ page: 1, limit: 100 })
      .then((res) => setVehicles(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showAddDeviceForm) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creatingDevice) setShowAddDeviceForm(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showAddDeviceForm, creatingDevice]);

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
    if (expandedDeviceId === deviceId) {
      setExpandedDeviceId(null);
      return;
    }
    setExpandedDeviceId(deviceId);
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

  const handleSaveLatestLocation = async (device: Device, position: Position | null) => {
    if (!position || savingLocationId === device.id) return;
    const label = device.name?.trim() || device.imei;
    const defaultName = `${label} latest`;
    const name = window.prompt('Location name', defaultName)?.trim();
    if (!name) return;
    setSavingLocationId(device.id);
    try {
      await createSavedLocation({
        name,
        latitude: position.latitude,
        longitude: position.longitude,
        notes: `Saved from Devices for ${label} at ${new Date(position.timestamp).toLocaleString()}`,
      });
      window.alert(`Saved location "${name}".`);
    } catch (err) {
      window.alert(getErrorMessage(err, 'Failed to save location'));
    } finally {
      setSavingLocationId(null);
    }
  };

  const handleCreateDevice = async (event: FormEvent) => {
    event.preventDefault();
    const identifier = newDeviceIdentifier.trim();
    if (!identifier) return;
    const imei = newDeviceKind === 'osmand' && !identifier.startsWith('osmand-')
      ? `osmand-${identifier}`
      : identifier;
    const osmandSecret = newDeviceKind === 'osmand' && newDeviceSecret.trim()
      ? newDeviceSecret.trim()
      : undefined;
    if (osmandSecret && osmandSecret.length < 16) {
      setCreateError('The OsmAnd/Traccar secret must be at least 16 characters, or leave it blank.');
      return;
    }
    setCreatingDevice(true);
    setCreateError(null);
    try {
      const response = await createDevice({
        imei,
        name: newDeviceName.trim() || null,
        osmandSecret,
      });
      setDevices((current) => [response.device, ...current]);
      setNewDeviceIdentifier('');
      setNewDeviceName('');
      setNewDeviceSecret('');
      setShowAddDeviceForm(false);
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Failed to create device'));
    } finally {
      setCreatingDevice(false);
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading...</p></div>;
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;

  const vehicleByDeviceId = (deviceId: string): Vehicle | undefined =>
    vehicles.find((v) => v.deviceId === deviceId);

  return (
    <div className="page">
      <div className="page-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <h2 className="page-heading">Devices</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setCreateError(null);
            setShowAddDeviceForm(true);
          }}
        >
          Add device
        </button>
      </div>
      <p className="page-subheading">Trackers by IMEI. Use <strong>port 5023</strong> for GT06-compatible hardware (TCP), <strong>port 5064</strong> for Eelink / G500M devices (plain TCP), or <strong>port 5055</strong> for OsmAnd / Traccar Client (HTTP). Link a device to a vehicle on the vehicle&apos;s page for trips and fuel.</p>
      {showAddDeviceForm && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-device-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !creatingDevice) setShowAddDeviceForm(false);
          }}
        >
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="modal-dialog-header">
              <h3 id="add-device-title" className="modal-dialog-title">Add device</h3>
              <button
                type="button"
                className="modal-dialog-close"
                onClick={() => setShowAddDeviceForm(false)}
                aria-label="Close"
                disabled={creatingDevice}
              >×</button>
            </div>
            <div className="modal-dialog-body">
              <form onSubmit={(event) => void handleCreateDevice(event)}>
        <p className="card-meta">Devices must be provisioned before tracker traffic is accepted. Movara does not auto-create devices from incoming connections.</p>
        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="new-device-kind">Device type</label>
          <select
            id="new-device-kind"
            className="input"
            value={newDeviceKind}
            onChange={(event) => setNewDeviceKind(event.target.value as 'osmand' | 'imei')}
            disabled={creatingDevice}
          >
            <option value="osmand">Traccar Client / OsmAnd</option>
            <option value="imei">GT06 / Eelink IMEI</option>
          </select>
        </div>
        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="new-device-identifier">{newDeviceKind === 'osmand' ? 'Traccar device identifier' : 'Device IMEI'}</label>
          <input
            id="new-device-identifier"
            className="input"
            value={newDeviceIdentifier}
            onChange={(event) => setNewDeviceIdentifier(event.target.value)}
            placeholder={newDeviceKind === 'osmand' ? 'Exactly as shown in Traccar Client' : 'Hardware IMEI'}
            maxLength={80}
            disabled={creatingDevice}
            required
          />
          {newDeviceKind === 'osmand' && (
            <p className="card-meta" style={{ marginTop: '0.25rem' }}>
              Movara stores this as <code>osmand-{newDeviceIdentifier.trim() || '<identifier>'}</code>. Keep the identifier unprefixed in Traccar Client and use server URL <code>http://YOUR_MOVARA_HOST:5055</code>.
            </p>
          )}
        </div>
        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="new-device-name">Name (optional)</label>
          <input
            id="new-device-name"
            className="input"
            value={newDeviceName}
            onChange={(event) => setNewDeviceName(event.target.value)}
            placeholder="My phone"
            maxLength={120}
            disabled={creatingDevice}
          />
        </div>
        {newDeviceKind === 'osmand' && (
          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="new-device-secret">Shared secret (optional)</label>
            <input
              id="new-device-secret"
              type="password"
              className="input"
              value={newDeviceSecret}
              onChange={(event) => setNewDeviceSecret(event.target.value)}
              placeholder="At least 16 characters"
              autoComplete="new-password"
              disabled={creatingDevice}
            />
            <p className="card-meta" style={{ marginTop: '0.25rem' }}>
              If set, add <code>?token=YOUR_SECRET</code> to the Traccar server URL. Leave blank only on a trusted network.
            </p>
          </div>
        )}
        {createError && <p className="form-error">{createError}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="button" className="btn" onClick={() => setShowAddDeviceForm(false)} disabled={creatingDevice}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={creatingDevice || !newDeviceIdentifier.trim()}>
                    {creatingDevice ? 'Adding...' : 'Add device'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {saveError && <p className="form-error">{saveError}</p>}
      {deleteError && <p className="form-error">{deleteError}</p>}

      {devices.length === 0 ? <p className="muted">No devices yet. Select Add device before sending tracker data.</p> : <ul className="list">
        {devices.map((d) => {
          const linkedVehicle = vehicleByDeviceId(d.id);
          const latestPosition = devicePositionById[d.id] ?? null;
          const liveAttributes = getPreferredLiveAttributes(d);
          const positionAttributes = (((latestPosition?.attributes as Record<string, unknown> | undefined) ?? {}));
          const liveTelemetry = extractTelemetry(liveAttributes);
          const positionTelemetry = extractTelemetry(positionAttributes);
          const preferredBatteryPercent = liveTelemetry?.batteryPercent ?? positionTelemetry?.batteryPercent ?? null;
          const preferredBatteryVoltage = liveTelemetry?.batteryVoltage ?? positionTelemetry?.batteryVoltage ?? null;
          const preferredFuelLevel = liveTelemetry?.fuelLevel ?? positionTelemetry?.fuelLevel ?? null;
          const preferredRpm = liveTelemetry?.rpm ?? positionTelemetry?.rpm ?? null;
          const preferredCoolantTemp = liveTelemetry?.coolantTemp ?? positionTelemetry?.coolantTemp ?? null;
          const preferredCharging = liveTelemetry?.charging ?? positionTelemetry?.charging ?? null;
          const preferredSignalPercent = liveTelemetry?.gsmSignalPercent ?? positionTelemetry?.gsmSignalPercent ?? null;
          const defenseArmed = typeof liveAttributes.defense_armed === 'boolean' ? liveAttributes.defense_armed : null;
          const gpsTracking = typeof liveAttributes.gps_tracking === 'boolean' ? liveAttributes.gps_tracking : null;
          const heartbeatAlarmCode = typeof liveAttributes.heartbeat_alarm_code === 'number' ? liveAttributes.heartbeat_alarm_code : null;
          const batteryLevelCode = typeof liveAttributes.battery_level_code === 'number' ? liveAttributes.battery_level_code : null;
          const gsmSignalCode = typeof liveAttributes.gsm_signal_code === 'number' ? liveAttributes.gsm_signal_code : null;
          const gt06InfoSubtype = typeof liveAttributes.gt06_info_subtype === 'string' ? liveAttributes.gt06_info_subtype : null;
          const gt06Fence = typeof liveAttributes.gt06_fence === 'string' ? liveAttributes.gt06_fence : null;
          const gt06StatusCode = typeof liveAttributes.gt06_status_code === 'string' ? liveAttributes.gt06_status_code : null;
          const packetAttributes = d.packetAttributes ?? [];
          const isExpanded = expandedDeviceId === d.id;
          const preferredLivePacketId = getPreferredLivePacketId(d.protocol);
          const summaryBits = [
            d.status === 'online' ? 'Online' : 'Offline',
            preferredBatteryPercent != null ? `Battery ${Math.round(preferredBatteryPercent * 100)}%` : null,
            preferredCharging != null ? (preferredCharging ? 'Charging' : 'Not charging') : null,
            liveTelemetry?.ignition != null ? `Ignition ${liveTelemetry.ignition ? 'On' : 'Off'}` : null,
            preferredSignalPercent != null ? `Signal ${Math.round(preferredSignalPercent * 100)}%` : null,
            formatRelativeTime(d.lastSeen),
          ].filter(Boolean) as string[];
          const detailRows = compactDetailRows([
            { label: 'Last packet', value: formatRelativeTime(d.lastSeen) },
            { label: 'Latest point', value: latestPosition ? formatRelativeTime(latestPosition.timestamp) : '--' },
            { label: 'Coords', value: latestPosition ? formatCoords(latestPosition.latitude, latestPosition.longitude) : '--' },
            { label: 'Speed', value: latestPosition?.speed != null ? `${formatNumber(latestPosition.speed)} km/h` : '--' },
            {
              label: preferredLivePacketId ? 'Status packet' : 'Live status source',
              value: preferredLivePacketId ? formatPacketIdLabel(d.protocol, preferredLivePacketId) : '--',
            },
            { label: 'Live ignition', value: liveTelemetry?.ignition != null ? (liveTelemetry.ignition ? 'On' : 'Off') : '--' },
            { label: 'Last GPS ignition', value: positionTelemetry?.ignition != null ? (positionTelemetry.ignition ? 'On' : 'Off') : '--' },
            { label: 'Last GPS fix', value: typeof positionAttributes.gps_fix === 'boolean' ? (positionAttributes.gps_fix ? 'Yes' : 'No') : '--' },
            { label: 'Battery', value: preferredBatteryPercent != null ? `${Math.round(preferredBatteryPercent * 100)}%` : '--' },
            { label: 'Voltage', value: preferredBatteryVoltage != null ? `${formatNumber(preferredBatteryVoltage, 1)} V` : '--' },
            { label: 'Fuel', value: preferredFuelLevel != null ? `${Math.round(preferredFuelLevel)}%` : '--' },
            { label: 'RPM', value: preferredRpm != null ? `${Math.round(preferredRpm)}` : '--' },
            { label: 'Coolant', value: preferredCoolantTemp != null ? `${Math.round(preferredCoolantTemp)} C` : '--' },
            { label: 'Charging', value: preferredCharging != null ? (preferredCharging ? 'Yes' : 'No') : '--' },
            { label: 'Signal', value: preferredSignalPercent != null ? `${Math.round(preferredSignalPercent * 100)}%` : '--' },
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

                        {latestPosition && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void handleSaveLatestLocation(d, latestPosition)}
                              disabled={savingLocationId === d.id}
                            >
                              {savingLocationId === d.id ? 'Saving location...' : 'Save latest location'}
                            </button>
                          </div>
                        )}

                        {packetAttributes.length > 0 && (
                          <div className="device-report-block">
                            <div className="device-detail-label" style={{ marginTop: 0 }}>Packet data</div>
                            <div style={{ display: 'grid', gap: '0.8rem' }}>
                              {packetAttributes.map((snapshot) => (
                                <div key={`${d.id}-${snapshot.packetId}`} style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                                    <div className="device-detail-label" style={{ margin: 0 }}>{formatPacketIdLabel(d.protocol, snapshot.packetId)}</div>
                                    <div className="muted" style={{ fontSize: '0.8rem' }}>{formatRelativeTime(snapshot.updatedAt)}</div>
                                  </div>
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
                                    {JSON.stringify(snapshot.attributes, null, 2)}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {Object.keys(positionAttributes).length > 0 && (
                          <div className="device-report-block">
                            <div className="device-detail-label" style={{ marginTop: 0 }}>Latest stored position data</div>
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
                              {JSON.stringify(positionAttributes, null, 2)}
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
      </ul>}

    </div>
  );
}
