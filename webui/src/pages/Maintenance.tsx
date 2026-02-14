import { useEffect, useState } from 'react';
import { fetchVehicles, type Vehicle } from '../api/vehicles';
import {
  fetchMaintenanceByVehicle,
  createMaintenanceRecord,
  type MaintenanceRecord,
  type MaintenanceType,
  type CreateMaintenancePayload,
} from '../api/maintenance';
import { getErrorMessage } from '../utils/getErrorMessage';

const MAINTENANCE_TYPES: { value: MaintenanceType; label: string }[] = [
  { value: 'service', label: 'Service' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function Maintenance() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [formVehicleId, setFormVehicleId] = useState('');
  const [formType, setFormType] = useState<MaintenanceType>('service');
  const [formDate, setFormDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOdometer, setFormOdometer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setVehiclesLoading(true);
    fetchVehicles({ page: 1, limit: 100 })
      .then((res) => setVehicles(res.data))
      .finally(() => setVehiclesLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedVehicleId) {
      setRecords([]);
      setListError(null);
      return;
    }
    setListLoading(true);
    setListError(null);
    fetchMaintenanceByVehicle(selectedVehicleId, { page: 1, limit: 100 })
      .then((res) => setRecords(res.data))
      .catch((err) => setListError(getErrorMessage(err, 'Failed to load records')))
      .finally(() => setListLoading(false));
  }, [selectedVehicleId]);

  const loadRecords = () => {
    if (!selectedVehicleId) return;
    setListLoading(true);
    setListError(null);
    fetchMaintenanceByVehicle(selectedVehicleId, { page: 1, limit: 100 })
      .then((res) => setRecords(res.data))
      .catch((err) => setListError(getErrorMessage(err, 'Failed to load records')))
      .finally(() => setListLoading(false));
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const vehicleId = formVehicleId.trim();
    const dateStr = formDate.trim();
    if (!vehicleId || !dateStr) {
      setSubmitError('Vehicle and date are required');
      return;
    }
    const payload: CreateMaintenancePayload = {
      vehicleId,
      type: formType,
      date: new Date(dateStr).toISOString(),
      notes: formNotes.trim() || null,
      odometer: formOdometer.trim() ? parseInt(formOdometer.trim(), 10) : null,
    };
    if (Number.isNaN(payload.odometer as number)) {
      setSubmitError('Odometer must be a number');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      await createMaintenanceRecord(payload);
      setFormDate('');
      setFormNotes('');
      setFormOdometer('');
      if (selectedVehicleId === vehicleId) loadRecords();
    } catch (err) {
      const error = err as Error & { fields?: Record<string, string[]> };
      if (error.fields && typeof error.fields === 'object') {
        setFieldErrors(error.fields);
        setSubmitError(error.message);
      } else {
        setSubmitError(getErrorMessage(error, 'Failed to add record'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Filter by vehicle</h2>
        {vehiclesLoading ? (
          <p className="muted">Loading vehicles…</p>
        ) : (
          <select
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className="form-select"
          >
            <option value="">Select a vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} {v.description ? `— ${v.description}` : ''}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="page-section">
        <h2 className="page-heading">Add maintenance record</h2>
        <form onSubmit={handleAddSubmit} className="form">
          <div className="form-row">
            <label htmlFor="maint-vehicle">Vehicle</label>
            <select
              id="maint-vehicle"
              value={formVehicleId}
              onChange={(e) => setFormVehicleId(e.target.value)}
              className={fieldErrors.vehicleId ? 'form-select input-invalid' : 'form-select'}
              disabled={submitting || vehiclesLoading}
            >
              <option value="">Select vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {fieldErrors.vehicleId?.length ? (
              <span className="form-error">{fieldErrors.vehicleId.join(', ')}</span>
            ) : null}
          </div>
          <div className="form-row">
            <label htmlFor="maint-type">Type</label>
            <select
              id="maint-type"
              value={formType}
              onChange={(e) => setFormType(e.target.value as MaintenanceType)}
              className="form-select"
              disabled={submitting}
            >
              {MAINTENANCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="maint-date">Date</label>
            <input
              id="maint-date"
              type="datetime-local"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className={fieldErrors.date ? 'input-invalid' : ''}
              disabled={submitting}
            />
            {fieldErrors.date?.length ? (
              <span className="form-error">{fieldErrors.date.join(', ')}</span>
            ) : null}
          </div>
          <div className="form-row">
            <label htmlFor="maint-notes">Notes (optional)</label>
            <input
              id="maint-notes"
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="e.g. Oil change"
              className={fieldErrors.notes ? 'input-invalid' : ''}
              maxLength={1000}
              disabled={submitting}
            />
            {fieldErrors.notes?.length ? (
              <span className="form-error">{fieldErrors.notes.join(', ')}</span>
            ) : null}
          </div>
          <div className="form-row">
            <label htmlFor="maint-odometer">Odometer (optional)</label>
            <input
              id="maint-odometer"
              type="number"
              min={1}
              value={formOdometer}
              onChange={(e) => setFormOdometer(e.target.value)}
              placeholder="e.g. 45000"
              className={fieldErrors.odometer ? 'input-invalid' : ''}
              disabled={submitting}
            />
            {fieldErrors.odometer?.length ? (
              <span className="form-error">{fieldErrors.odometer.join(', ')}</span>
            ) : null}
          </div>
          {submitError &&
            !fieldErrors.vehicleId?.length &&
            !fieldErrors.date?.length &&
            !fieldErrors.type?.length ? (
            <p className="form-error">{submitError}</p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add record'}
          </button>
        </form>
      </section>

      <section className="page-section">
        <h2 className="page-heading">Records</h2>
        {!selectedVehicleId ? (
          <p className="muted">Select a vehicle above to view records.</p>
        ) : listLoading ? (
          <p className="muted">Loading…</p>
        ) : listError ? (
          <p className="form-error">{listError}</p>
        ) : records.length === 0 ? (
          <p className="muted">No maintenance records for this vehicle.</p>
        ) : (
          <ul className="list">
            {records.map((r) => (
              <li key={r.id} className="list-item">
                <div className="list-item-main">
                  <strong>{r.type}</strong>
                  {r.notes ? <span className="muted"> — {r.notes}</span> : null}
                  {r.odometer != null ? (
                    <span className="muted"> · {r.odometer.toLocaleString()} km</span>
                  ) : null}
                </div>
                <div className="list-item-meta">{formatDate(r.date)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
