import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDevices, updateDevice, deleteDevice, type Device } from '../api/devices';
import { fetchVehicles, type Vehicle } from '../api/vehicles';
import { getErrorMessage } from '../utils/getErrorMessage';

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
      <p className="page-subheading">Trackers by IMEI. Link a device to a vehicle on the vehicle’s page for trips and fuel.</p>
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
    </div>
  );
}
