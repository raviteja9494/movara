import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  fetchVehicle,
  updateVehicle,
  fetchFuelRecords,
  createFuelRecord,
  updateFuelRecord,
  deleteVehicle,
  deleteFuelRecord,
  uploadVehiclePhoto,
  getVehiclePhotoBlobUrl,
  vehicleIconEmoji,
  VEHICLE_ICONS,
  type Vehicle,
  type FuelRecord,
  type CreateFuelRecordPayload,
  type UpdateFuelRecordPayload,
} from '../api/vehicles';
import { fetchDevices, type Device } from '../api/devices';
import { fetchMaintenanceByVehicle, type MaintenanceRecord } from '../api/maintenance';
import { getErrorMessage } from '../utils/getErrorMessage';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance, formatFuelVolume, formatFuelEconomy, toKm, toLiters } from '../utils/units';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Short date for chart x-axis (e.g. "11 Jan") */
function formatChartDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

function deviceLabel(d: Device): string {
  return d.name?.trim() || d.imei;
}

/** Average fuel consumption L/100 km from fuel records (consecutive fills). */
function avgFuelConsumptionL100km(records: FuelRecord[]): number | null {
  const sorted = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let totalDistance = 0;
  let totalLiters = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dist = sorted[i].odometer - sorted[i - 1].odometer;
    if (dist > 0 && sorted[i].fuelQuantity > 0) {
      totalDistance += dist;
      totalLiters += sorted[i].fuelQuantity;
    }
  }
  if (totalDistance <= 0) return null;
  return (totalLiters / totalDistance) * 100;
}

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const { preferences } = usePreferences();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editDeviceId, setEditDeviceId] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState<string | null>(null);

  const [editDetails, setEditDetails] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLicensePlate, setEditLicensePlate] = useState('');
  const [editVin, setEditVin] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editMake, setEditMake] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editOdometer, setEditOdometer] = useState('');
  const [editFuelType, setEditFuelType] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [showAddFuelForm, setShowAddFuelForm] = useState(false);
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formOdometer, setFormOdometer] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formRate, setFormRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [deletingFuelId, setDeletingFuelId] = useState<string | null>(null);
  const [fuelRecordLimit, setFuelRecordLimit] = useState<number>(24);
  const [editingFuelRecord, setEditingFuelRecord] = useState<FuelRecord | null>(null);
  const [editFuelDate, setEditFuelDate] = useState('');
  const [editFuelOdometer, setEditFuelOdometer] = useState('');
  const [editFuelQuantity, setEditFuelQuantity] = useState('');
  const [editFuelCost, setEditFuelCost] = useState('');
  const [editFuelRate, setEditFuelRate] = useState('');
  const [editFuelSubmitting, setEditFuelSubmitting] = useState(false);
  const [editFuelError, setEditFuelError] = useState<string | null>(null);
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState<string | null>(null);
  const photoBlobUrlRef = useRef<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const navigate = useNavigate();

  const MAX_PHOTO_SIZE_BYTES = 1024 * 1024; // 1 MB

  const load = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchVehicle(id),
      fetchDevices({ page: 1, limit: 100 }),
      fetchFuelRecords(id),
    ])
      .then(([vRes, dRes, fRes]) => {
        const v = vRes.vehicle;
        setVehicle(v);
        setEditDeviceId(v.deviceId ?? null);
        setEditIcon(v.icon ?? null);
        setEditName(v.name);
        setEditDescription(v.description ?? '');
        setEditLicensePlate(v.licensePlate ?? '');
        setEditVin(v.vin ?? '');
        setEditYear(v.year != null ? String(v.year) : '');
        setEditMake(v.make ?? '');
        setEditModel(v.model ?? '');
        setEditOdometer(v.currentOdometer != null ? String(v.currentOdometer) : '');
        setEditFuelType(v.fuelType ?? '');
        setDevices(dRes.data);
        setFuelRecords(fRes.fuelRecords);
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!vehicle?.photoPath || !id) {
      if (photoBlobUrlRef.current) URL.revokeObjectURL(photoBlobUrlRef.current);
      photoBlobUrlRef.current = null;
      setVehiclePhotoUrl(null);
      return;
    }
    let cancelled = false;
    getVehiclePhotoBlobUrl(id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (photoBlobUrlRef.current) URL.revokeObjectURL(photoBlobUrlRef.current);
        photoBlobUrlRef.current = url;
        setVehiclePhotoUrl(url);
      })
      .catch(() => setVehiclePhotoUrl(null));
    return () => {
      cancelled = true;
      if (photoBlobUrlRef.current) {
        URL.revokeObjectURL(photoBlobUrlRef.current);
        photoBlobUrlRef.current = null;
      }
    };
  }, [id, vehicle?.photoPath]);

  useEffect(() => {
    if (!id) return;
    fetchMaintenanceByVehicle(id, { page: 1, limit: 20 })
      .then((res) => setMaintenanceRecords(res.data))
      .catch(() => setMaintenanceRecords([]));
  }, [id]);

  const avgFuelL100 = useMemo(() => avgFuelConsumptionL100km(fuelRecords), [fuelRecords]);
  const lastMaintenance = maintenanceRecords.length > 0
    ? maintenanceRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    : null;
  const lastOdo = vehicle?.currentOdometer ?? (fuelRecords.length > 0
    ? Math.max(...fuelRecords.map((r) => r.odometer))
    : null);

  const handleSaveDetails = async () => {
    if (!id || !vehicle) return;
    setSavingDetails(true);
    try {
      const yearNum = editYear.trim() ? parseInt(editYear, 10) : null;
      const odoNum = editOdometer.trim() ? parseInt(editOdometer, 10) : null;
      const res = await updateVehicle(id, {
        name: editName.trim() || vehicle.name,
        description: editDescription.trim() || null,
        licensePlate: editLicensePlate.trim() || null,
        vin: editVin.trim() || null,
        year: yearNum != null && !Number.isNaN(yearNum) ? yearNum : null,
        make: editMake.trim() || null,
        model: editModel.trim() || null,
        currentOdometer: odoNum != null && !Number.isNaN(odoNum) ? odoNum : null,
        fuelType: editFuelType.trim() || null,
        deviceId: editDeviceId ?? null,
        icon: editIcon ?? null,
      });
      setVehicle(res.vehicle);
      setEditDetails(false);
    } catch {
      // ignore
    } finally {
      setSavingDetails(false);
    }
  };

  const closeAddFuelForm = useCallback(() => {
    setShowAddFuelForm(false);
    setFormError(null);
  }, []);

  const closeEditFuelForm = useCallback(() => {
    setEditingFuelRecord(null);
    setEditFuelError(null);
  }, []);

  const openEditFuel = (r: FuelRecord) => {
    setEditingFuelRecord(r);
    setEditFuelDate(r.date.toString().slice(0, 10));
    const odoDisplay = preferences.distanceUnit === 'mi' ? r.odometer / 1.609344 : r.odometer;
    setEditFuelOdometer(String(Math.round(odoDisplay * 100) / 100));
    const qtyDisplay = preferences.fuelVolumeUnit === 'gal' ? r.fuelQuantity / 3.785411784 : r.fuelQuantity;
    setEditFuelQuantity(String(qtyDisplay.toFixed(2)));
    setEditFuelCost(r.fuelCost != null ? String(r.fuelCost) : '');
    setEditFuelRate(r.fuelRate != null ? String(r.fuelRate) : '');
    setEditFuelError(null);
  };

  const handleEditFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !editingFuelRecord) return;
    const odometer = editFuelOdometer.trim()
      ? Math.round(toKm(parseFloat(editFuelOdometer), preferences.distanceUnit))
      : editingFuelRecord.odometer;
    const quantity = editFuelQuantity.trim()
      ? toLiters(parseFloat(editFuelQuantity), preferences.fuelVolumeUnit)
      : editingFuelRecord.fuelQuantity;
    const cost = editFuelCost.trim() ? parseFloat(editFuelCost) : null;
    const rate = editFuelRate.trim() ? parseFloat(editFuelRate) : null;
    if (cost == null && rate == null) {
      setEditFuelError('Enter either fuel cost or fuel rate.');
      return;
    }
    const payload: UpdateFuelRecordPayload = {
      date: new Date(editFuelDate).toISOString(),
      odometer,
      fuelQuantity: quantity,
      fuelCost: cost ?? undefined,
      fuelRate: rate ?? undefined,
    };
    setEditFuelSubmitting(true);
    setEditFuelError(null);
    try {
      const res = await updateFuelRecord(id, editingFuelRecord.id, payload);
      setFuelRecords((prev) => prev.map((r) => (r.id === res.fuelRecord.id ? res.fuelRecord : r)));
      setEditingFuelRecord(null);
    } catch (err) {
      setEditFuelError(getErrorMessage(err, 'Failed to update fuel record'));
    } finally {
      setEditFuelSubmitting(false);
    }
  };

  const closeEditDetails = useCallback(() => {
    setEditDetails(false);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddFuelForm) closeAddFuelForm();
        if (editDetails) closeEditDetails();
        if (editingFuelRecord) closeEditFuelForm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAddFuelForm, editDetails, editingFuelRecord, closeAddFuelForm, closeEditDetails, closeEditFuelForm]);

  const handleAddFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const odoRaw = formOdometer.trim() ? parseFloat(formOdometer) : undefined;
    const qtyRaw = formQuantity.trim() ? parseFloat(formQuantity) : undefined;
    const odometer = odoRaw != null && !Number.isNaN(odoRaw) ? Math.round(toKm(odoRaw, preferences.distanceUnit)) : undefined;
    const quantity = qtyRaw != null && !Number.isNaN(qtyRaw) ? toLiters(qtyRaw, preferences.fuelVolumeUnit) : undefined;
    const cost = formCost.trim() ? parseFloat(formCost) : undefined;
    const rate = formRate.trim() ? parseFloat(formRate) : undefined;
    if (!formDate || odometer == null || odometer < 0 || !quantity || quantity <= 0) {
      setFormError('Date, odometer and fuel quantity are required.');
      return;
    }
    if (cost == null && rate == null) {
      setFormError('Enter either fuel cost or fuel rate.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: CreateFuelRecordPayload = {
        date: new Date(formDate).toISOString(),
        odometer,
        fuelQuantity: quantity,
      };
      if (cost != null) payload.fuelCost = cost;
      if (rate != null) payload.fuelRate = rate;
      const res = await createFuelRecord(id, payload);
      setFuelRecords((prev) => [res.fuelRecord, ...prev]);
      setShowAddFuelForm(false);
      setFormDate(new Date().toISOString().slice(0, 10));
      setFormOdometer('');
      setFormQuantity('');
      setFormCost('');
      setFormRate('');
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to add fuel record'));
    } finally {
      setSubmitting(false);
    }
  };

  const chartRecords = useMemo(() => {
    const limit = fuelRecordLimit >= 999 ? fuelRecords.length : fuelRecordLimit;
    return fuelRecords.slice(0, limit).reverse();
  }, [fuelRecords, fuelRecordLimit]);
  const maxCost = useMemo(() => Math.max(...chartRecords.map((r) => r.fuelCost ?? 0), 1), [chartRecords]);
  const chartBarMaxHeight = 180;

  const handleDeleteVehicle = async () => {
    if (!id || !vehicle || !window.confirm(`Delete vehicle "${vehicle.name}"? This will also remove all fuel and maintenance records for this vehicle.`)) return;
    setDeletingVehicle(true);
    try {
      await deleteVehicle(id);
      navigate('/vehicles', { replace: true });
    } catch {
      setDeletingVehicle(false);
    }
  };

  const handleDeleteFuelRecord = async (recordId: string) => {
    if (!id || !window.confirm('Delete this fuel record?')) return;
    setDeletingFuelId(recordId);
    try {
      await deleteFuelRecord(id, recordId);
      setFuelRecords((prev) => prev.filter((r) => r.id !== recordId));
    } finally {
      setDeletingFuelId(null);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!id || !file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setPhotoUploadError(null);
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      setPhotoUploadError('File too large. Maximum size is 1 MB. Use a smaller or compressed image.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const res = await uploadVehiclePhoto(id, file);
      setVehicle(res.vehicle);
    } catch (err) {
      setPhotoUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (!id) return <div className="page">Invalid vehicle</div>;
  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error || !vehicle) {
    return (
      <div className="page">
        <p className="form-error">{error || 'Vehicle not found'}</p>
        <Link to="/vehicles" className="btn-link">← Back to vehicles</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/vehicles" className="btn-link">← Vehicles</Link>
      </div>

      <section className="page-section">
        <h2 className="page-heading" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>{vehicleIconEmoji(vehicle.icon)}</span>
          {vehicle.name}
        </h2>
        <p className="page-subheading">
          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
          {vehicle.licensePlate && ` · ${vehicle.licensePlate}`}
        </p>

        <div className="card" style={{ marginTop: '0.75rem', maxWidth: '320px' }}>
          <div className="card-title">Vehicle photo</div>
          {vehiclePhotoUrl ? (
            <div style={{ marginBottom: '0.5rem' }}>
              <img src={vehiclePhotoUrl} alt={vehicle.name} style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }} />
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>No photo</p>
          )}
          <label className="btn btn-secondary" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 0 }}>
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handlePhotoUpload} disabled={uploadingPhoto} style={{ display: 'none' }} />
            {uploadingPhoto ? 'Uploading…' : vehicle.photoPath ? 'Change photo' : 'Upload photo'}
          </label>
          {photoUploadError && (
            <p className="form-error" style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem' }}>{photoUploadError}</p>
          )}
        </div>

        {!editDetails ? (
          <div className="card" style={{ marginTop: '0.75rem', maxWidth: '520px' }}>
            <div className="card-title">Vehicle details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {vehicle.licensePlate && <span><strong>License:</strong> {vehicle.licensePlate}</span>}
              {vehicle.vin && <span><strong>VIN:</strong> {vehicle.vin}</span>}
              {vehicle.year != null && <span><strong>Year:</strong> {vehicle.year}</span>}
              {vehicle.make && <span><strong>Make:</strong> {vehicle.make}</span>}
              {vehicle.model && <span><strong>Model:</strong> {vehicle.model}</span>}
              {vehicle.currentOdometer != null && (
                <span><strong>Odometer:</strong> {formatDistance(vehicle.currentOdometer, preferences.distanceUnit)}</span>
              )}
              {vehicle.fuelType && <span><strong>Fuel:</strong> {vehicle.fuelType}</span>}
              {vehicle.deviceId && (() => {
                const dev = devices.find((d) => d.id === vehicle.deviceId);
                return <span><strong>Device:</strong> {dev ? deviceLabel(dev) : 'Linked'}</span>;
              })()}
              <span><strong>Icon:</strong> {vehicleIconEmoji(vehicle.icon)}</span>
            </div>
            {vehicle.description && <p className="card-meta" style={{ marginBottom: '0.5rem' }}>{vehicle.description}</p>}
            <button type="button" className="btn btn-secondary" onClick={() => setEditDetails(true)}>
              Edit details
            </button>
          </div>
        ) : null}

        {editDetails && (
          <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && closeEditDetails()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-edit-vehicle-title"
          >
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
              <div className="modal-dialog-header">
                <h3 id="modal-edit-vehicle-title" className="modal-dialog-title">Edit vehicle details</h3>
                <button type="button" className="modal-dialog-close" onClick={closeEditDetails} aria-label="Close">×</button>
              </div>
              <div className="modal-dialog-body">
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="form-row">
                <label>Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input" />
              </div>
              <div className="form-row">
                <label>License plate</label>
                <input type="text" value={editLicensePlate} onChange={(e) => setEditLicensePlate(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>VIN</label>
                <input type="text" value={editVin} onChange={(e) => setEditVin(e.target.value)} className="input" placeholder="Optional" maxLength={17} />
              </div>
              <div className="form-row">
                <label>Year</label>
                <input type="number" min={1900} max={2100} value={editYear} onChange={(e) => setEditYear(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Make</label>
                <input type="text" value={editMake} onChange={(e) => setEditMake(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Model</label>
                <input type="text" value={editModel} onChange={(e) => setEditModel(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Current odometer</label>
                <input type="number" min={0} value={editOdometer} onChange={(e) => setEditOdometer(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Fuel type</label>
                <input type="text" value={editFuelType} onChange={(e) => setEditFuelType(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Link device</label>
                <select
                  value={editDeviceId ?? ''}
                  onChange={(e) => setEditDeviceId(e.target.value || null)}
                  className="input"
                >
                  <option value="">None</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>{deviceLabel(d)}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Icon</label>
                <select
                  value={editIcon ?? ''}
                  onChange={(e) => setEditIcon(e.target.value || null)}
                  className="input"
                >
                  {VEHICLE_ICONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.emoji} {opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label>Description</label>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="input" rows={2} placeholder="Optional" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-primary" onClick={handleSaveDetails} disabled={savingDetails}>
                    {savingDetails ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeEditDetails}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="vehicle-summary card" style={{ marginTop: '1rem', maxWidth: '520px' }}>
          <div className="card-title">At a glance</div>
          <div className="stats-bar" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            {lastOdo != null && (
              <span><strong>Odometer:</strong> {formatDistance(lastOdo, preferences.distanceUnit)}</span>
            )}
            {avgFuelL100 != null && (
              <span>
                <strong>Avg economy:</strong>{' '}
                {formatFuelEconomy(avgFuelL100, preferences.distanceUnit, preferences.fuelVolumeUnit)}
              </span>
            )}
            {lastMaintenance && (
              <span>
                <strong>Last service:</strong> {lastMaintenance.type}
                {lastMaintenance.odometer != null && ` @ ${formatDistance(lastMaintenance.odometer, preferences.distanceUnit)}`}
                {' · '}
                {formatDate(lastMaintenance.date)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link to={`/maintenance?vehicleId=${id}`} className="btn-link">View all maintenance →</Link>
            <button
              type="button"
              className="btn-link danger"
              onClick={handleDeleteVehicle}
              disabled={deletingVehicle}
            >
              {deletingVehicle ? 'Deleting…' : 'Delete vehicle'}
            </button>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h3 className="page-heading">Fuel history</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAddFuelForm(true)}
          >
            Add fuel record
          </button>
        </div>
        {showAddFuelForm && (
          <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && closeAddFuelForm()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-add-fuel-title"
          >
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="modal-dialog-header">
                <h3 id="modal-add-fuel-title" className="modal-dialog-title">Add fuel record</h3>
                <button type="button" className="modal-dialog-close" onClick={closeAddFuelForm} aria-label="Close">×</button>
              </div>
              <div className="modal-dialog-body">
                <p className="card-meta" style={{ marginBottom: '0.75rem' }}>Odometer, quantity and either cost or rate (the other is calculated).</p>
                <form onSubmit={handleAddFuel} className="form">
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-row">
                  <label>Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="input"
                  />
                </div>
                <div className="form-row">
                  <label>Odometer</label>
                  <input
                    type="number"
                    min={0}
                    value={formOdometer}
                    onChange={(e) => setFormOdometer(e.target.value)}
                    placeholder={preferences.distanceUnit === 'mi' ? 'mi' : 'km'}
                    className="input"
                  />
                </div>
                <div className="form-row">
                  <label>Fuel quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    placeholder={preferences.fuelVolumeUnit === 'gal' ? 'gal' : 'L'}
                    className="input"
                  />
                </div>
                <div className="form-row">
                  <label>Fuel cost</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formCost}
                    onChange={(e) => setFormCost(e.target.value)}
                    placeholder="Optional"
                    className="input"
                  />
                </div>
                <div className="form-row">
                  <label>Fuel rate (per unit)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    placeholder="Optional"
                    className="input"
                  />
                </div>
              </div>
              {formError && <p className="form-error">{formError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Save fuel record'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeAddFuelForm}>
                  Cancel
                </button>
              </div>
            </form>
              </div>
            </div>
          </div>
        )}
        {fuelRecords.length > 0 && (
          <div className="fuel-chart">
            <div className="fuel-chart-toolbar">
              <label>
                Show{' '}
                <select
                  value={fuelRecordLimit >= 999 ? 'all' : fuelRecordLimit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFuelRecordLimit(v === 'all' ? 999 : Number(v));
                  }}
                  className="input"
                  style={{ marginLeft: '0.25rem', width: 'auto', display: 'inline-block' }}
                >
                  <option value={10}>10</option>
                  <option value={24}>24</option>
                  <option value={50}>50</option>
                  <option value="all">All</option>
                </select>
                {' '}records
              </label>
            </div>
            <div className="fuel-chart-inner">
              <div className="fuel-chart-y-axis" aria-hidden="true">
                <span>{new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency, maximumFractionDigits: 0 }).format(maxCost)}</span>
                <span>{new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency, maximumFractionDigits: 0 }).format(maxCost / 2)}</span>
                <span>{new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency, maximumFractionDigits: 0 }).format(0)}</span>
              </div>
              <div className="fuel-chart-bars-area">
                <div className="fuel-chart-bars">
                  {chartRecords.map((r) => (
                    <div key={r.id} className="fuel-chart-bar-wrap">
                      <div className="fuel-chart-bar-slot" style={{ height: chartBarMaxHeight }}>
                        <div
                          className="fuel-chart-bar"
                          role="img"
                          aria-label={`${formatDate(r.date)}: ${new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency }).format(r.fuelCost ?? 0)}, ${formatFuelVolume(r.fuelQuantity, preferences.fuelVolumeUnit)}`}
                          style={{
                            height: `${Math.max(8, Math.round(((r.fuelCost ?? 0) / maxCost) * chartBarMaxHeight))}px`,
                          }}
                        />
                      </div>
                      <span className="fuel-chart-bar-label">
                        {formatChartDate(r.date)}
                      </span>
                      <span className="fuel-chart-bar-detail">
                        {new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency, maximumFractionDigits: 0 }).format(r.fuelCost ?? 0)} · {formatFuelVolume(r.fuelQuantity, preferences.fuelVolumeUnit)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="fuel-chart-caption">
              Fuel cost per fill. Cost and volume shown under each bar—no hover needed on touch devices.
            </p>
          </div>
        )}
        {fuelRecords.length === 0 && !showAddFuelForm ? (
          <p className="muted">No fuel records yet. Click &quot;Add fuel record&quot; to add one.</p>
        ) : fuelRecords.length === 0 ? null : (
          <div className="table-wrap table-wrap--scroll" style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Odometer</th>
                  <th>Quantity</th>
                  <th>Cost</th>
                  <th>Rate</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fuelRecords.slice(0, fuelRecordLimit >= 999 ? undefined : fuelRecordLimit).map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.date)}</td>
                    <td>{formatDistance(r.odometer, preferences.distanceUnit)}</td>
                    <td>{formatFuelVolume(r.fuelQuantity, preferences.fuelVolumeUnit)}</td>
                    <td>
                      {r.fuelCost != null
                        ? new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency }).format(r.fuelCost)
                        : '—'}
                    </td>
                    <td>{r.fuelRate != null ? r.fuelRate.toFixed(2) : '—'}</td>
                    <td>
                      {r.latitude != null && r.longitude != null ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}&zoom=15`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-link"
                        >
                          Map
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => openEditFuel(r)}
                      >
                        Edit
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="btn-link danger"
                        onClick={() => handleDeleteFuelRecord(r.id)}
                        disabled={deletingFuelId === r.id}
                      >
                        {deletingFuelId === r.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingFuelRecord && (
          <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && closeEditFuelForm()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-edit-fuel-title"
          >
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="modal-dialog-header">
                <h3 id="modal-edit-fuel-title" className="modal-dialog-title">Edit fuel record</h3>
                <button type="button" className="modal-dialog-close" onClick={closeEditFuelForm} aria-label="Close">×</button>
              </div>
              <div className="modal-dialog-body">
                <form onSubmit={handleEditFuel} className="form">
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div className="form-row">
                      <label>Date</label>
                      <input
                        type="date"
                        value={editFuelDate}
                        onChange={(e) => setEditFuelDate(e.target.value)}
                        required
                        className="input"
                        disabled={editFuelSubmitting}
                      />
                    </div>
                    <div className="form-row">
                      <label>Odometer</label>
                      <input
                        type="number"
                        min={0}
                        value={editFuelOdometer}
                        onChange={(e) => setEditFuelOdometer(e.target.value)}
                        placeholder={preferences.distanceUnit === 'mi' ? 'mi' : 'km'}
                        className="input"
                        disabled={editFuelSubmitting}
                      />
                    </div>
                    <div className="form-row">
                      <label>Fuel quantity</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={editFuelQuantity}
                        onChange={(e) => setEditFuelQuantity(e.target.value)}
                        placeholder={preferences.fuelVolumeUnit === 'gal' ? 'gal' : 'L'}
                        className="input"
                        disabled={editFuelSubmitting}
                      />
                    </div>
                    <div className="form-row">
                      <label>Fuel cost</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editFuelCost}
                        onChange={(e) => setEditFuelCost(e.target.value)}
                        placeholder="Optional"
                        className="input"
                        disabled={editFuelSubmitting}
                      />
                    </div>
                    <div className="form-row">
                      <label>Fuel rate (per unit)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editFuelRate}
                        onChange={(e) => setEditFuelRate(e.target.value)}
                        placeholder="Optional"
                        className="input"
                        disabled={editFuelSubmitting}
                      />
                    </div>
                  </div>
                  {editFuelError && <p className="form-error">{editFuelError}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary" disabled={editFuelSubmitting}>
                      {editFuelSubmitting ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={closeEditFuelForm}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="page-section">
        <h3 className="page-heading">Trips</h3>
        <p className="page-subheading" style={{ marginBottom: '0.75rem' }}>
          Trips are created manually or imported from GPX. View and filter by vehicle in the Trips menu.
        </p>
        <div>
          <Link to={`/trips?vehicleId=${encodeURIComponent(id!)}`} className="btn btn-secondary">
            View trips for this vehicle
          </Link>
        </div>
      </section>
    </div>
  );
}
