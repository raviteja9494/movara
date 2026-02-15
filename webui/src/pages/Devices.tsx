import { useEffect, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { fetchDevices, updateDevice, deleteDevice, type Device } from '../api/devices';
import { fetchVehicles, type Vehicle } from '../api/vehicles';
import { fetchRawLog, type RawLogEntry } from '../api/rawLog';
import { getErrorMessage } from '../utils/getErrorMessage';

const PORT_OPTIONS = [
  { value: '', label: 'All ports' },
  { value: '5051', label: '5051 (GT06)' },
  { value: '5055', label: '5055 (OsmAnd)' },
];

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
  const [showRawLog, setShowRawLog] = useState(false);
  const [rawEntries, setRawEntries] = useState<RawLogEntry[]>([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawPortFilter, setRawPortFilter] = useState('');
  const [rawLimit, setRawLimit] = useState(100);
  const [expandedRawIdx, setExpandedRawIdx] = useState<number | null>(null);

  const loadDevices = () => {
    setLoading(true);
    setError(null);
    fetchDevices({ page: 1, limit: 100 })
      .then((res) => setDevices(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load devices')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    fetchVehicles({ page: 1, limit: 100 })
      .then((res) => setVehicles(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showRawLog) return;
    setRawError(null);
    setRawLoading(true);
    const port = rawPortFilter ? parseInt(rawPortFilter, 10) : undefined;
    fetchRawLog({ port, limit: rawLimit })
      .then((res) => setRawEntries(res.entries))
      .catch((err) => setRawError(getErrorMessage(err, 'Failed to load raw log')))
      .finally(() => setRawLoading(false));
  }, [showRawLog, rawPortFilter, rawLimit]);

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
      setDevices((prev) =>
        prev.map((d) => (d.id === id ? { ...d, name } : d)),
      );
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
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to delete device'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (devices.length === 0) return <div className="page"><p className="muted">No devices yet.</p></div>;

  const vehicleByDeviceId = (deviceId: string): Vehicle | undefined =>
    vehicles.find((v) => v.deviceId === deviceId);

  return (
    <div className="page">
      <h2 className="page-heading">Devices</h2>
      <p className="page-subheading">Trackers by IMEI. Use <strong>port 5051</strong> for GT06-compatible hardware (TCP), or <strong>port 5055</strong> for OsmAnd / Traccar Client (HTTP). Link a device to a vehicle on the vehicle’s page for trips and fuel.</p>
      {saveError && <p className="form-error">{saveError}</p>}
      {deleteError && <p className="form-error">{deleteError}</p>}
      <ul className="list">
        {devices.map((d) => {
          const linkedVehicle = vehicleByDeviceId(d.id);
          return (
          <li key={d.id} className="list-item">
            <div className="list-item-main">
              <span className="list-item-imei">{d.imei}</span>
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
                      if (e.key === 'Enter') saveName(d.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => saveName(d.id)}
                    disabled={savingId === d.id}
                  >
                    {savingId === d.id ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={cancelEdit}
                    disabled={savingId === d.id}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="list-item-alias">
                  {d.name ? (
                    <> — <strong>{d.name}</strong> <button type="button" className="btn-link" onClick={() => startEdit(d)}>Rename</button></>
                  ) : (
                    <button type="button" className="btn-link" onClick={() => startEdit(d)}>Set alias</button>
                  )}
                  {' '}
                  <button
                    type="button"
                    className="btn-link danger"
                    onClick={() => handleDelete(d)}
                    disabled={deletingId === d.id}
                  >
                    {deletingId === d.id ? 'Deleting…' : 'Delete'}
                  </button>
                </span>
              )}
              {linkedVehicle && (
                <div className="list-item-meta" style={{ marginTop: '0.25rem' }}>
                  Linked to{' '}
                  <Link to={`/vehicles/${linkedVehicle.id}`} className="btn-link">
                    {linkedVehicle.name}
                  </Link>
                </div>
              )}
            </div>
          </li>
          );
        })}
      </ul>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: showRawLog ? '1rem' : 0 }}>
          <input
            type="checkbox"
            checked={showRawLog}
            onChange={(e) => {
              setShowRawLog(e.target.checked);
              setExpandedRawIdx(null);
            }}
          />
          <span>Show raw log</span>
        </label>

        {showRawLog && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <label>
                Port{' '}
                <select
                  value={rawPortFilter}
                  onChange={(e) => setRawPortFilter(e.target.value)}
                  className="input"
                  style={{ marginLeft: '0.25rem' }}
                >
                  {PORT_OPTIONS.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Limit{' '}
                <select
                  value={rawLimit}
                  onChange={(e) => setRawLimit(Number(e.target.value))}
                  className="input"
                  style={{ marginLeft: '0.25rem' }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </label>
              <button type="button" className="btn btn-secondary" onClick={() => { setRawLoading(true); fetchRawLog({ port: rawPortFilter ? parseInt(rawPortFilter, 10) : undefined, limit: rawLimit }).then((r) => setRawEntries(r.entries)).catch((e) => setRawError(getErrorMessage(e, 'Failed'))).finally(() => setRawLoading(false)); }} disabled={rawLoading}>
                {rawLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {rawError && <p className="form-error">{rawError}</p>}
            {!rawError && rawEntries.length === 0 && !rawLoading && (
              <p className="muted">No entries. Send data to port 5051 (GT06) or 5055 (OsmAnd) to see it here.</p>
            )}
            {rawEntries.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '2rem' }} />
                      <th>Time</th>
                      <th>Port</th>
                      <th>Client IP</th>
                      <th>Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawEntries.map((e, i) => (
                      <Fragment key={`${e.at}-${i}`}>
                        <tr
                          key={`${e.at}-${i}`}
                          onClick={() => setExpandedRawIdx(expandedRawIdx === i ? null : i)}
                          style={{ cursor: 'pointer' }}
                          className={expandedRawIdx === i ? 'raw-log-row-expanded' : ''}
                        >
                          <td style={{ verticalAlign: 'middle' }}>
                            <span style={{ opacity: 0.6 }}>{expandedRawIdx === i ? '▼' : '▶'}</span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{e.at}</td>
                          <td>{e.port}</td>
                          <td style={{ fontSize: '0.85rem' }} title={e.remoteAddress ?? ''}>{e.remoteAddress ?? '—'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', maxWidth: '50ch' }} title={e.raw}>
                            {expandedRawIdx === i ? e.raw : (e.raw.length > 80 ? e.raw.slice(0, 80) + '…' : e.raw)}
                          </td>
                        </tr>
                        {expandedRawIdx === i && (
                          <tr key={`${e.at}-${i}-exp`}>
                            <td colSpan={5} style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--bg-secondary)', fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                              {e.raw}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
