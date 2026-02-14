import { useEffect, useState } from 'react';
import { fetchDevices, updateDevice, deleteDevice, type Device } from '../api/devices';

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
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
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load devices'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDevices();
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
      setSaveError(err instanceof Error ? err.message : 'Failed to update name');
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
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete device');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (devices.length === 0) return <div className="page"><p className="muted">No devices yet.</p></div>;

  return (
    <div className="page">
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Give devices a friendly alias (name) so you can identify them easily, e.g. &quot;Truck 01&quot; or &quot;Car - John&quot;.
      </p>
      {saveError && <p className="form-error">{saveError}</p>}
      {deleteError && <p className="form-error">{deleteError}</p>}
      <ul className="list">
        {devices.map((d) => (
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
                    className="btn-link"
                    onClick={() => handleDelete(d)}
                    disabled={deletingId === d.id}
                    style={{ color: 'var(--danger, #c00)' }}
                  >
                    {deletingId === d.id ? 'Deleting…' : 'Delete'}
                  </button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
