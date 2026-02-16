import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  fetchTrips,
  createTrip,
  deleteTrip,
  importTripGpx,
  type TripListItem,
  type CreateTripPayload,
} from '../api/trips';
import { fetchVehicles, type Vehicle } from '../api/vehicles';
import { fetchDevices, type Device } from '../api/devices';
import { getErrorMessage } from '../utils/getErrorMessage';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function Trips() {
  const [searchParams, setSearchParams] = useSearchParams();
  const vehicleIdParam = searchParams.get('vehicleId') ?? '';
  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';

  const [data, setData] = useState<TripListItem[]>([]);
  const [legacyTrips, setLegacyTrips] = useState<LegacyTripItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDeviceId, setCreateDeviceId] = useState('');
  const [createStart, setCreateStart] = useState('');
  const [createEnd, setCreateEnd] = useState('');
  const [createVehicleId, setCreateVehicleId] = useState('');
  const [createName, setCreateName] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importVehicleId, setImportVehicleId] = useState('');
  const [importName, setImportName] = useState('');
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTrips = useCallback(() => {
    setLoading(true);
    setError(null);
    const params: Parameters<typeof fetchTrips>[0] = { page: 1, limit: 50 };
    if (vehicleIdParam) params.vehicleId = vehicleIdParam;
    if (fromParam) params.from = fromParam;
    if (toParam) params.to = toParam;
    fetchTrips(params)
      .then((res) => {
        setData(res.data);
        setPagination(res.pagination);
      })
      .catch((e) => setError(getErrorMessage(e, 'Failed to load trips')))
      .finally(() => setLoading(false));
  }, [vehicleIdParam, fromParam, toParam]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    fetchVehicles({ page: 1, limit: 100 }).then((r) => setVehicles(r.data)).catch(() => setVehicles([]));
    fetchDevices({ page: 1, limit: 100 }).then((r) => setDevices(r.data)).catch(() => setDevices([]));
  }, []);

  const handleCreate = async () => {
    if (!createDeviceId || !createStart || !createEnd) {
      setCreateError('Device, start and end are required.');
      return;
    }
    const start = new Date(createStart);
    const end = new Date(createEnd);
    if (end.getTime() <= start.getTime()) {
      setCreateError('End must be after start.');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const payload: CreateTripPayload = {
        deviceId: createDeviceId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      };
      if (createVehicleId) payload.vehicleId = createVehicleId;
      if (createName.trim()) payload.name = createName.trim();
      await createTrip(payload);
      setCreateOpen(false);
      setCreateDeviceId('');
      setCreateStart('');
      setCreateEnd('');
      setCreateVehicleId('');
      setCreateName('');
      loadTrips();
    } catch (e) {
      setCreateError(getErrorMessage(e, 'Failed to create trip'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setImportError('Select a GPX file.');
      return;
    }
    setImportSubmitting(true);
    setImportError(null);
    try {
      await importTripGpx(importFile, {
        vehicleId: importVehicleId || undefined,
        name: importName.trim() || undefined,
      });
      setImportOpen(false);
      setImportFile(null);
      setImportVehicleId('');
      setImportName('');
      loadTrips();
    } catch (e) {
      setImportError(getErrorMessage(e, 'Failed to import GPX'));
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trip?')) return;
    setDeletingId(id);
    try {
      await deleteTrip(id);
      loadTrips();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Trips</h1>
      <p className="page-subheading">
        Create trips manually by selecting a device and time range, or import a GPX file. Filter by vehicle or date.
      </p>

      <div className="page-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          New trip
        </button>
        <button type="button" className="btn" onClick={() => setImportOpen(true)}>
          Import GPX
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <label>
          Vehicle:{' '}
          <select
            className="input"
            value={vehicleIdParam}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams((p) => {
                const next = new URLSearchParams(p);
                if (v) next.set('vehicleId', v);
                else next.delete('vehicleId');
                return next;
              });
            }}
          >
            <option value="">All</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From:{' '}
          <input
            type="datetime-local"
            className="input"
            value={fromParam}
            onChange={(e) =>
              setSearchParams((p) => {
                const next = new URLSearchParams(p);
                if (e.target.value) next.set('from', e.target.value);
                else next.delete('from');
                return next;
              })
            }
          />
        </label>
        <label>
          To:{' '}
          <input
            type="datetime-local"
            className="input"
            value={toParam}
            onChange={(e) =>
              setSearchParams((p) => {
                const next = new URLSearchParams(p);
                if (e.target.value) next.set('to', e.target.value);
                else next.delete('to');
                return next;
              })
            }
          />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading trips…</p>
      ) : data.length === 0 ? (
        <p className="muted">No trips. Create one or import a GPX file.</p>
      ) : (
        <ul className="trip-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {data.map((t) => (
            <li key={t.id} className="trip-list-item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Link to={`/trips/${t.id}`} className="trip-list-link" style={{ flex: 1 }}>
                <span className="trip-list-datetime">{formatDateTime(t.startTime)}</span>
                <span className="trip-list-id">{t.name || t.id.slice(0, 8)}</span>
                <span className="trip-list-meta">
                  {t.vehicle?.name ?? 'No vehicle'} · {t.source === 'imported' ? 'GPX' : t.device?.name ?? t.device?.imei ?? '—'}
                </span>
              </Link>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(t.id)}
                disabled={deletingId === t.id}
                aria-label="Delete trip"
              >
                {deletingId === t.id ? '…' : 'Delete'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pagination.pages > 1 && (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Page {pagination.page} of {pagination.pages} ({pagination.total} trips)
        </p>
      )}

      {createOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-trip-title"
          onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-dialog-header">
              <h2 id="create-trip-title" className="modal-dialog-title">Create trip</h2>
              <button type="button" className="modal-dialog-close" onClick={() => setCreateOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-dialog-body">
            <p className="muted" style={{ marginTop: 0, marginBottom: '1rem' }}>Select device and time range. Optionally assign a vehicle.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label>
                Device *
                <select
                  className="input"
                  value={createDeviceId}
                  onChange={(e) => setCreateDeviceId(e.target.value)}
                  required
                >
                  <option value="">Select device</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.imei}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start *
                <input
                  type="datetime-local"
                  className="input"
                  value={createStart}
                  onChange={(e) => setCreateStart(e.target.value)}
                />
              </label>
              <label>
                End *
                <input
                  type="datetime-local"
                  className="input"
                  value={createEnd}
                  onChange={(e) => setCreateEnd(e.target.value)}
                />
              </label>
              <label>
                Vehicle (optional)
                <select
                  className="input"
                  value={createVehicleId}
                  onChange={(e) => setCreateVehicleId(e.target.value)}
                >
                  <option value="">None</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name (optional)
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Morning commute"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </label>
            </div>
            {createError && <p className="form-error">{createError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={createSubmitting || !createDeviceId || !createStart || !createEnd}
              >
                {createSubmitting ? 'Creating…' : 'Create'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-gpx-title"
          onClick={(e) => e.target === e.currentTarget && setImportOpen(false)}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-dialog-header">
              <h2 id="import-gpx-title" className="modal-dialog-title">Import GPX</h2>
              <button type="button" className="modal-dialog-close" onClick={() => setImportOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-dialog-body">
            <p className="muted" style={{ marginTop: 0, marginBottom: '1rem' }}>Upload a GPX file to create a trip. Optionally assign a vehicle.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label>
                GPX file *
                <input
                  type="file"
                  className="input"
                  accept=".gpx,application/gpx+xml"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label>
                Vehicle (optional)
                <select
                  className="input"
                  value={importVehicleId}
                  onChange={(e) => setImportVehicleId(e.target.value)}
                >
                  <option value="">None</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name (optional)
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Weekend ride"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                />
              </label>
            </div>
            {importError && <p className="form-error">{importError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importSubmitting || !importFile}
              >
                {importSubmitting ? 'Importing…' : 'Import'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
