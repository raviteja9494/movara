import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  fetchVehicle,
  updateVehicle,
  fetchFuelRecords,
  createFuelRecord,
  fetchVehicleTrips,
  deleteVehicle,
  deleteFuelRecord,
  vehicleIconEmoji,
  VEHICLE_ICONS,
  type Vehicle,
  type FuelRecord,
  type Trip,
  type CreateFuelRecordPayload,
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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
  const [savingLink, setSavingLink] = useState(false);

  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formOdometer, setFormOdometer] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formRate, setFormRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsRangeDays, setTripsRangeDays] = useState(7);
  const [tripsUseCustom, setTripsUseCustom] = useState(false);
  const [tripsFrom, setTripsFrom] = useState('');
  const [tripsTo, setTripsTo] = useState('');
  const [tripsLoading, setTripsLoading] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [deletingFuelId, setDeletingFuelId] = useState<string | null>(null);
  const navigate = useNavigate();

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
        setVehicle(vRes.vehicle);
        setEditDeviceId(vRes.vehicle.deviceId ?? null);
        setEditIcon(vRes.vehicle.icon ?? null);
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

  useEffect(() => {
    if (!id || !vehicle?.deviceId) {
      setTrips([]);
      return;
    }
    if (tripsUseCustom && (!tripsFrom || !tripsTo)) {
      setTrips([]);
      return;
    }
    setTripsLoading(true);
    let from: Date;
    let to: Date;
    if (tripsUseCustom && tripsFrom && tripsTo) {
      from = new Date(tripsFrom);
      to = new Date(tripsTo);
    } else {
      to = new Date();
      from = new Date(to.getTime() - tripsRangeDays * 24 * 60 * 60 * 1000);
    }
    fetchVehicleTrips(id, from.toISOString(), to.toISOString())
      .then((r) => setTrips(r.trips))
      .catch(() => setTrips([]))
      .finally(() => setTripsLoading(false));
  }, [id, vehicle?.deviceId, tripsRangeDays, tripsUseCustom, tripsFrom, tripsTo]);

  const handleSaveLink = async () => {
    if (!id || !vehicle) return;
    setSavingLink(true);
    try {
      const res = await updateVehicle(id, {
        deviceId: editDeviceId ?? null,
        icon: editIcon ?? null,
      });
      setVehicle(res.vehicle);
    } catch {
      // ignore
    } finally {
      setSavingLink(false);
    }
  };

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
      setFormDate('');
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

  const maxCost = Math.max(...fuelRecords.map((r) => r.fuelCost ?? 0), 1);

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

        <div className="card" style={{ marginTop: '0.75rem', maxWidth: '420px' }}>
          <div className="card-title">Link device & icon</div>
          <p className="card-meta" style={{ marginBottom: '0.5rem' }}>
            Link a tracker so fuel fill location is recorded from the device position.
          </p>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
            <div className="form-row">
              <label>Device</label>
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
            <div className="form-row" style={{ alignSelf: 'end' }}>
              <button type="button" className="btn btn-primary" onClick={handleSaveLink} disabled={savingLink}>
                {savingLink ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>

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
        <h3 className="page-heading">Add fuel record</h3>
        <p className="page-subheading">Odometer, quantity and either cost or rate (the other is calculated).</p>
        <form onSubmit={handleAddFuel} className="form" style={{ maxWidth: '520px' }}>
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
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add fuel record'}
          </button>
        </form>
      </section>

      <section className="page-section">
        <h3 className="page-heading">Trips</h3>
        <p className="page-subheading">
          Trips are derived from the linked device&apos;s position data (gap &gt; 30 min = new trip).
        </p>
        {!vehicle.deviceId ? (
          <p className="muted">Link a device above to see trips.</p>
        ) : (
          <>
            <div style={{ marginBottom: '0.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              <label>
                Range:{' '}
                <select
                  value={tripsUseCustom ? 'custom' : String(tripsRangeDays)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'custom') setTripsUseCustom(true);
                    else {
                      setTripsUseCustom(false);
                      setTripsRangeDays(Number(v));
                    }
                  }}
                  className="input"
                  style={{ marginLeft: '0.25rem' }}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value="custom">Custom range</option>
                </select>
              </label>
              {tripsUseCustom && (
                <>
                  <label>
                    From{' '}
                    <input
                      type="date"
                      value={tripsFrom}
                      onChange={(e) => setTripsFrom(e.target.value)}
                      className="input"
                      style={{ marginLeft: '0.25rem' }}
                    />
                  </label>
                  <label>
                    To{' '}
                    <input
                      type="date"
                      value={tripsTo}
                      onChange={(e) => setTripsTo(e.target.value)}
                      className="input"
                      style={{ marginLeft: '0.25rem' }}
                    />
                  </label>
                </>
              )}
            </div>
            {tripsLoading ? (
              <p className="muted">Loading trips…</p>
            ) : trips.length === 0 ? (
              <p className="muted">No trips in this range.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Start</th>
                      <th>End</th>
                      <th>Distance</th>
                      <th>Points</th>
                      <th>Map</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((t, i) => (
                      <tr key={i}>
                        <td>{formatDateTime(t.startedAt)}</td>
                        <td>{formatDateTime(t.endedAt)}</td>
                        <td>{formatDistance(t.distanceKm, preferences.distanceUnit)}</td>
                        <td>{t.pointCount}</td>
                        <td>
                          <Link
                            to={`/tracking?deviceId=${vehicle.deviceId}&from=${encodeURIComponent(t.startedAt)}&to=${encodeURIComponent(t.endedAt)}`}
                            className="btn-link"
                          >
                            Map
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="page-section">
        <h3 className="page-heading">Fuel history</h3>
        {fuelRecords.length > 0 && (
          <div className="fuel-chart" style={{ marginBottom: '1rem' }}>
            <div className="fuel-chart-bars" style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '120px' }}>
              {fuelRecords.slice(0, 24).reverse().map((r) => (
                <div
                  key={r.id}
                  title={`${formatDate(r.date)}: ${(r.fuelCost ?? 0).toFixed(0)}`}
                  style={{
                    flex: 1,
                    minWidth: '12px',
                    height: `${Math.max(4, ((r.fuelCost ?? 0) / maxCost) * 100)}%`,
                    backgroundColor: 'var(--accent)',
                    opacity: 0.85,
                    borderRadius: '2px',
                  }}
                />
              ))}
            </div>
            <div className="card-meta" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
              Bar = fuel cost per fill (last 24 records)
            </div>
          </div>
        )}
        {fuelRecords.length === 0 ? (
          <p className="muted">No fuel records yet.</p>
        ) : (
          <div className="table-wrap">
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
                  {fuelRecords.map((r) => (
                    <tr key={r.id}>
                    <td>{formatDate(r.date)}</td>
                    <td>{formatDistance(r.odometer, preferences.distanceUnit)}</td>
                    <td>{formatFuelVolume(r.fuelQuantity, preferences.fuelVolumeUnit)}</td>
                    <td>{r.fuelCost != null ? r.fuelCost.toFixed(2) : '—'}</td>
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
      </section>
    </div>
  );
}
