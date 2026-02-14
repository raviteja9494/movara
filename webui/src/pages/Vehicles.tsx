import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchVehicles,
  createVehicle,
  deleteVehicle,
  vehicleIconEmoji,
  VEHICLE_ICONS,
  type Vehicle,
  type CreateVehiclePayload,
} from '../api/vehicles';
import { fetchDevices, type Device } from '../api/devices';
import { getErrorMessage } from '../utils/getErrorMessage';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance } from '../utils/units';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function vehicleSummary(v: Vehicle): string {
  const parts: string[] = [];
  if (v.year ?? v.make ?? v.model) {
    parts.push([v.year, v.make, v.model].filter(Boolean).join(' '));
  }
  if (v.licensePlate) parts.push(v.licensePlate);
  return parts.length ? parts.join(' · ') : v.name;
}

export function Vehicles() {
  const { preferences } = usePreferences();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [currentOdometer, setCurrentOdometer] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [icon, setIcon] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadVehicles = async () => {
    setLoading(true);
    setListError(null);
    setDeleteError(null);
    try {
      const res = await fetchVehicles({ page: 1, limit: 100 });
      setVehicles(res.data);
    } catch (err) {
      setListError(getErrorMessage(err, 'Failed to load vehicles'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  useEffect(() => {
    fetchDevices({ page: 1, limit: 100 })
      .then((res) => setDevices(res.data))
      .catch(() => {});
  }, []);

  const handleDeleteVehicle = async (e: React.MouseEvent, v: Vehicle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete vehicle "${v.name}"? This will also remove all fuel and maintenance records.`)) return;
    setDeleteError(null);
    setDeletingId(v.id);
    try {
      await deleteVehicle(v.id);
      await loadVehicles();
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to delete vehicle'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateVehiclePayload = {
      name: name.trim(),
      description: description.trim() || null,
      licensePlate: licensePlate.trim() || null,
      vin: vin.trim() || null,
      year: year.trim() ? parseInt(year.trim(), 10) : null,
      make: make.trim() || null,
      model: model.trim() || null,
      currentOdometer: currentOdometer.trim() ? parseInt(currentOdometer.trim(), 10) : null,
      fuelType: fuelType.trim() || null,
      icon: icon.trim() || null,
      deviceId: deviceId.trim() || null,
    };
    if (!payload.name) {
      setSubmitError('Name is required');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      await createVehicle(payload);
      setName('');
      setDescription('');
      setLicensePlate('');
      setVin('');
      setYear('');
      setMake('');
      setModel('');
      setCurrentOdometer('');
      setFuelType('');
      setIcon('');
      setDeviceId('');
      setShowAddForm(false);
      await loadVehicles();
    } catch (err) {
      const error = err as Error & { fields?: Record<string, string[]> };
      if (error.fields && typeof error.fields === 'object') {
        setFieldErrors(error.fields);
        setSubmitError(error.message);
      } else {
        setSubmitError(getErrorMessage(err, 'Failed to add vehicle'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Vehicles</h2>
        <p className="page-subheading">Fleet list. Link a device to use trips and fuel location.</p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : listError ? (
          <p className="form-error">{listError}</p>
        ) : deleteError ? (
          <p className="form-error">{deleteError}</p>
        ) : vehicles.length === 0 ? (
          <p className="muted">No vehicles yet. Click the button below to add one.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {vehicles.map((v) => (
              <Link
                key={v.id}
                to={`/vehicles/${v.id}`}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{vehicleIconEmoji(v.icon)}</span>
                    {v.name}
                  </div>
                  <div className="card-meta">
                    {vehicleSummary(v)}
                    {v.currentOdometer != null && ` · ${formatDistance(v.currentOdometer, preferences.distanceUnit)}`}
                    {v.fuelType && ` · ${v.fuelType}`}
                  </div>
                  {(v.vin || v.description) && (
                    <div className="card-meta" style={{ marginTop: '0.25rem' }}>
                      {v.vin && <span>VIN: {v.vin}</span>}
                      {v.vin && v.description && ' · '}
                      {v.description}
                    </div>
                  )}
                  <div className="card-meta" style={{ marginTop: '0.2rem', fontSize: '0.8rem' }}>
                    {v.deviceId
                      ? `Device: ${devices.find((d) => d.id === v.deviceId)?.name?.trim() || devices.find((d) => d.id === v.deviceId)?.imei || '—'}`
                      : 'No device linked'}
                  </div>
                  <div className="card-meta" style={{ marginTop: '0.2rem', fontSize: '0.75rem' }}>
                    Added {formatDate(v.createdAt)}
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn-link danger"
                      onClick={(e) => handleDeleteVehicle(e, v)}
                      disabled={deletingId === v.id}
                    >
                      {deletingId === v.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <h3 className="page-heading">{showAddForm ? 'Add vehicle' : 'Add new vehicle'}</h3>
        {!showAddForm ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            Add vehicle
          </button>
        ) : (
          <>
            <p className="page-subheading">Name is required; other fields optional (LubeLogger-style).</p>
            <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <label htmlFor="vehicle-name">Name</label>
            <input
              id="vehicle-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. display name or identifier"
              className={fieldErrors.name ? 'input-invalid' : ''}
              maxLength={255}
              disabled={submitting}
            />
            {fieldErrors.name?.length ? (
              <span className="form-error">{fieldErrors.name.join(', ')}</span>
            ) : null}
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="vehicle-licensePlate">License plate</label>
              <input
                id="vehicle-licensePlate"
                type="text"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="Optional"
                maxLength={32}
                disabled={submitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="vehicle-vin">VIN</label>
              <input
                id="vehicle-vin"
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder="17 characters"
                maxLength={17}
                disabled={submitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="vehicle-year">Year</label>
              <input
                id="vehicle-year"
                type="number"
                min={1900}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2020"
                disabled={submitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="vehicle-make">Make</label>
              <input
                id="vehicle-make"
                type="text"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="e.g. Toyota"
                maxLength={100}
                disabled={submitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="vehicle-model">Model</label>
              <input
                id="vehicle-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. Camry"
                maxLength={100}
                disabled={submitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="vehicle-currentOdometer">Current odometer</label>
              <input
                id="vehicle-currentOdometer"
                type="number"
                min={0}
                value={currentOdometer}
                onChange={(e) => setCurrentOdometer(e.target.value)}
                placeholder="km or mi"
                disabled={submitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="vehicle-fuelType">Fuel type</label>
              <input
                id="vehicle-fuelType"
                type="text"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
                placeholder="e.g. Petrol, Diesel, EV"
                maxLength={50}
                disabled={submitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="vehicle-icon">Icon</label>
              <select
                id="vehicle-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                disabled={submitting}
                className="input"
              >
                <option value="">Default</option>
                {VEHICLE_ICONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.emoji} {opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="vehicle-deviceId">Linked device</label>
              <select
                id="vehicle-deviceId"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                disabled={submitting}
                className="input"
              >
                <option value="">None</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name?.trim() || d.imei}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="vehicle-description">Notes</label>
            <input
              id="vehicle-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              className={fieldErrors.description ? 'input-invalid' : ''}
              maxLength={1000}
              disabled={submitting}
            />
            {fieldErrors.description?.length ? (
              <span className="form-error">{fieldErrors.description.join(', ')}</span>
            ) : null}
          </div>
              {submitError && !fieldErrors.name?.length && !fieldErrors.description?.length ? (
                <p className="form-error">{submitError}</p>
              ) : null}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add vehicle'}
                </button>
                <button type="button" className="btn" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
