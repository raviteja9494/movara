import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchVehicles, type Vehicle } from '../api/vehicles';
import {
  fetchMaintenanceByVehicle,
  createMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
  uploadMaintenanceReceipt,
  getMaintenanceReceiptBlobUrl,
  type MaintenanceRecord,
  type MaintenanceType,
  type CreateMaintenancePayload,
  type UpdateMaintenancePayload,
} from '../api/maintenance';
import { getErrorMessage } from '../utils/getErrorMessage';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance, toKm } from '../utils/units';

const MAINTENANCE_TYPES: { value: MaintenanceType; label: string; color: string }[] = [
  { value: 'service', label: 'Service', color: 'var(--accent)' },
  { value: 'fuel', label: 'Fuel', color: '#059669' },
  { value: 'repair', label: 'Repair', color: '#dc2626' },
  { value: 'inspection', label: 'Inspection', color: '#d97706' },
  { value: 'other', label: 'Other', color: '#6b7280' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatMonthYear(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function groupByMonth(records: MaintenanceRecord[]): Map<string, MaintenanceRecord[]> {
  const map = new Map<string, MaintenanceRecord[]>();
  for (const r of records) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  return map;
}

function sortMonthKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function Maintenance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { preferences } = usePreferences();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(() => searchParams.get('vehicleId') || '');

  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<MaintenanceType | ''>('');

  const [formVehicleId, setFormVehicleId] = useState('');
  const [formType, setFormType] = useState<MaintenanceType>('service');
  const [formDate, setFormDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOdometer, setFormOdometer] = useState('');
  const [formCost, setFormCost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [formReceiptFile, setFormReceiptFile] = useState<File | null>(null);
  const [formReceiptError, setFormReceiptError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingReceiptId, setUploadingReceiptId] = useState<string | null>(null);
  const [receiptUploadError, setReceiptUploadError] = useState<string | null>(null);

  const MAX_RECEIPT_SIZE_BYTES = 1024 * 1024; // 1 MB

  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [editType, setEditType] = useState<MaintenanceType>('service');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editOdometer, setEditOdometer] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const filteredRecords = useMemo(() => {
    if (!typeFilter) return records;
    return records.filter((r) => r.type === typeFilter);
  }, [records, typeFilter]);

  const groupedRecords = useMemo(() => groupByMonth(filteredRecords), [filteredRecords]);
  const monthKeys = useMemo(() => sortMonthKeys([...groupedRecords.keys()]), [groupedRecords]);

  const stats = useMemo(() => {
    const total = records.length;
    const totalCost = records.reduce((sum, r) => sum + (r.cost ?? 0), 0);
    const byType: Record<string, number> = {};
    for (const r of records) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    }
    const lastService = records
      .filter((r) => r.type === 'service' || r.type === 'repair' || r.type === 'inspection')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    return { total, totalCost, byType, lastService };
  }, [records]);

  const handleDeleteRecord = async (recordId: string) => {
    if (!window.confirm('Delete this maintenance record?')) return;
    setDeletingId(recordId);
    try {
      await deleteMaintenanceRecord(recordId);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
    } finally {
      setDeletingId(null);
    }
  };

  const handleReceiptUpload = async (recordId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) return;
    setReceiptUploadError(null);
    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      setReceiptUploadError('File too large. Maximum size is 1 MB. Use a smaller or compressed file.');
      return;
    }
    setUploadingReceiptId(recordId);
    try {
      const res = await uploadMaintenanceReceipt(recordId, file);
      setRecords((prev) => prev.map((r) => (r.id === recordId ? res.record : r)));
    } catch (err) {
      setReceiptUploadError(err instanceof Error ? err.message : 'Receipt upload failed');
    } finally {
      setUploadingReceiptId(null);
    }
  };

  const handleViewReceipt = async (recordId: string) => {
    try {
      const url = await getMaintenanceReceiptBlobUrl(recordId);
      window.open(url, '_blank', 'noopener');
    } catch {
      // ignore
    }
  };

  const isImageReceipt = (r: MaintenanceRecord) => {
    if (!r.receiptPath) return false;
    const ext = r.receiptPath.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext ?? '');
  };

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
      setReceiptUploadError(null);
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('vehicleId', selectedVehicleId);
      return next;
    }, { replace: true });
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
    const odoRaw = formOdometer.trim() ? parseFloat(formOdometer.trim()) : null;
    const odometer = odoRaw != null && !Number.isNaN(odoRaw)
      ? Math.round(toKm(odoRaw, preferences.distanceUnit))
      : null;
    const costRaw = formCost.trim() ? parseFloat(formCost.trim()) : null;
    const cost = costRaw != null && !Number.isNaN(costRaw) ? costRaw : null;
    const payload: CreateMaintenancePayload = {
      vehicleId,
      type: formType,
      date: new Date(dateStr).toISOString(),
      notes: formNotes.trim() || null,
      odometer,
      cost,
    };
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    const receiptFile = formReceiptFile;
    setFormReceiptFile(null);
    if (receiptFile && receiptFile.size > MAX_RECEIPT_SIZE_BYTES) {
      setSubmitError('Receipt file too large. Maximum size is 1 MB.');
      setSubmitting(false);
      return;
    }
    try {
      const { record: created } = await createMaintenanceRecord(payload);
      if (receiptFile) {
        setUploadingReceiptId(created.id);
        try {
          await uploadMaintenanceReceipt(created.id, receiptFile);
        } catch (uploadErr) {
          setReceiptUploadError(uploadErr instanceof Error ? uploadErr.message : 'Receipt upload failed');
        } finally {
          setUploadingReceiptId(null);
        }
      }
      setFormDate('');
      setFormNotes('');
      setFormOdometer('');
      setFormCost('');
      setShowAddForm(false);
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

  const getTypeColor = (type: string) => MAINTENANCE_TYPES.find((t) => t.value === type)?.color ?? 'var(--text-muted)';

  const openEdit = (r: MaintenanceRecord) => {
    setEditingRecord(r);
    setEditType(r.type as MaintenanceType);
    setEditDate(r.date.slice(0, 16));
    setEditNotes(r.notes ?? '');
    const odoDisplay = r.odometer != null
      ? (preferences.distanceUnit === 'mi' ? r.odometer / 1.609344 : r.odometer)
      : '';
    setEditOdometer(odoDisplay !== '' ? String(Math.round(odoDisplay * 100) / 100) : '');
    setEditCost(r.cost != null ? String(r.cost) : '');
    setEditError(null);
  };

  const closeAddForm = () => {
    setShowAddForm(false);
    setFormReceiptError(null);
    setSubmitError(null);
  };

  const closeEditForm = () => {
    setEditingRecord(null);
    setEditError(null);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddForm) closeAddForm();
        if (editingRecord) closeEditForm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAddForm, editingRecord]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const payload: UpdateMaintenancePayload = {
      type: editType,
      date: new Date(editDate).toISOString(),
      notes: editNotes.trim() || null,
      odometer: editOdometer.trim() ? Math.round(toKm(parseFloat(editOdometer), preferences.distanceUnit)) : null,
      cost: editCost.trim() ? parseFloat(editCost) : null,
    };
    setEditSubmitting(true);
    setEditError(null);
    try {
      const { record: updated } = await updateMaintenanceRecord(editingRecord.id, payload);
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditingRecord(null);
    } catch (err) {
      setEditError(getErrorMessage(err, 'Failed to update record'));
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Maintenance</h2>
        <p className="page-subheading">
          Service, fuel, repairs and inspections by vehicle — LubeLogger-style tracking with receipts and cost.
        </p>

        {vehiclesLoading ? (
          <p className="muted">Loading vehicles…</p>
        ) : (
          <div className="maint-toolbar">
            <label className="maint-filter">
              <span className="tracking-field-label">Vehicle</span>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="form-select"
                style={{ maxWidth: '320px' }}
              >
                <option value="">Select a vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.description ? `— ${v.description}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {selectedVehicleId && records.length > 0 && (
              <label className="maint-filter">
                <span className="tracking-field-label">Type</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as MaintenanceType | '')}
                  className="form-select"
                  style={{ maxWidth: '160px' }}
                >
                  <option value="">All types</option>
                  {MAINTENANCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selectedVehicleId && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowAddForm(true);
                  setFormVehicleId(selectedVehicleId);
                }}
              >
                + Add record
              </button>
            )}
          </div>
        )}
      </section>

      {selectedVehicleId && records.length > 0 && (
        <section className="page-section maint-stats">
          <div className="maint-stats-grid">
            <div className="maint-stat">
              <span className="maint-stat-value">{stats.total}</span>
              <span className="maint-stat-label">Records</span>
            </div>
            {stats.totalCost > 0 && (
              <div className="maint-stat">
                <span className="maint-stat-value">
                  {new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency, minimumFractionDigits: 0 }).format(stats.totalCost)}
                </span>
                <span className="maint-stat-label">Total cost</span>
              </div>
            )}
            {stats.lastService && (
              <div className="maint-stat">
                <span className="maint-stat-value">{formatDate(stats.lastService.date)}</span>
                <span className="maint-stat-label">Last service/repair</span>
              </div>
            )}
            <div className="maint-stat maint-stat-types">
              {MAINTENANCE_TYPES.filter((t) => (stats.byType[t.value] ?? 0) > 0).map((t) => (
                <span key={t.value} className="maint-type-chip" style={{ background: `${t.color}20`, color: t.color }}>
                  {t.label}: {stats.byType[t.value]}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {showAddForm && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeAddForm()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-add-title"
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header">
              <h3 id="modal-add-title" className="modal-dialog-title">Add new record</h3>
              <button type="button" className="modal-dialog-close" onClick={closeAddForm} aria-label="Close">×</button>
            </div>
            <div className="modal-dialog-body">
              <form onSubmit={handleAddSubmit} className="form form-grid maint-form">
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
              <label htmlFor="maint-odometer">Odometer (optional)</label>
              <input
                id="maint-odometer"
                type="number"
                min={0}
                step={1}
                value={formOdometer}
                onChange={(e) => setFormOdometer(e.target.value)}
                placeholder={preferences.distanceUnit === 'mi' ? 'e.g. 28000 mi' : 'e.g. 45000 km'}
                className={fieldErrors.odometer ? 'input-invalid' : ''}
                disabled={submitting}
              />
              {fieldErrors.odometer?.length ? (
                <span className="form-error">{fieldErrors.odometer.join(', ')}</span>
              ) : null}
            </div>
            <div className="form-row">
              <label htmlFor="maint-cost">Cost (optional)</label>
              <input
                id="maint-cost"
                type="number"
                min={0}
                step={0.01}
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
                placeholder="e.g. 150.00"
                className={fieldErrors.cost ? 'input-invalid' : ''}
                disabled={submitting}
              />
              {fieldErrors.cost?.length ? (
                <span className="form-error">{fieldErrors.cost.join(', ')}</span>
              ) : null}
            </div>
            <div className="form-row form-row-span">
              <label htmlFor="maint-notes">Notes (optional)</label>
              <input
                id="maint-notes"
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="e.g. Oil change, brake pads"
                className={fieldErrors.notes ? 'input-invalid' : ''}
                maxLength={1000}
                disabled={submitting}
              />
              {fieldErrors.notes?.length ? (
                <span className="form-error">{fieldErrors.notes.join(', ')}</span>
              ) : null}
            </div>
            <div className="form-row form-row-span">
              <label htmlFor="maint-receipt">Receipt (optional)</label>
              <input
                id="maint-receipt"
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,image/*,application/pdf"
                onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setFormReceiptError(null);
                if (file && file.size > MAX_RECEIPT_SIZE_BYTES) {
                  setFormReceiptError('File too large. Maximum size is 1 MB.');
                  setFormReceiptFile(null);
                  e.target.value = '';
                  return;
                }
                setFormReceiptFile(file);
              }}
                disabled={submitting}
              />
              {formReceiptFile && (
                <span className="muted" style={{ fontSize: '0.8rem' }}>{formReceiptFile.name}</span>
              )}
              {formReceiptError && (
                <p className="form-error" style={{ marginTop: '0.25rem', marginBottom: 0 }}>{formReceiptError}</p>
              )}
            </div>
            {submitError && (
              <p className="form-error form-row-span">{submitError}</p>
            )}
            <div className="form-row form-row-span" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Adding…' : 'Add record'}
              </button>
              <button type="button" className="btn" onClick={closeAddForm}>
                Cancel
              </button>
            </div>
          </form>
            </div>
          </div>
        </div>
      )}

      <section className="page-section">
        <h3 className="page-heading">Records</h3>
        {receiptUploadError && (
          <p className="form-error" style={{ marginBottom: '0.75rem' }}>{receiptUploadError}</p>
        )}
        {!selectedVehicleId ? (
          <p className="muted">Select a vehicle above to view records.</p>
        ) : listLoading ? (
          <p className="muted">Loading…</p>
        ) : listError ? (
          <p className="form-error">{listError}</p>
        ) : filteredRecords.length === 0 ? (
          <p className="muted">
            {typeFilter ? 'No records match the selected type.' : 'No maintenance records for this vehicle.'}
          </p>
        ) : (
          <div className="maint-timeline">
            {monthKeys.map((key) => {
              const list = groupedRecords.get(key) ?? [];
              const firstDate = list[0]?.date;
              const monthLabel = firstDate ? formatMonthYear(firstDate) : key;
              return (
                <div key={key} className="maint-month-group">
                  <h4 className="maint-month-label">{monthLabel}</h4>
                  <div className="maint-cards">
                    {list.map((r) => (
                      <div key={r.id} className="maint-card">
                        <div className="maint-card-header">
                          <span
                            className="maint-type-badge"
                            style={{ background: `${getTypeColor(r.type)}20`, color: getTypeColor(r.type) }}
                          >
                            {MAINTENANCE_TYPES.find((t) => t.value === r.type)?.label ?? r.type}
                          </span>
                          <span className="maint-card-date">{formatDate(r.date)}</span>
                        </div>
                        <div className="maint-card-body">
                          {r.notes && <p className="maint-card-notes">{r.notes}</p>}
                          <div className="maint-card-meta">
                            {r.odometer != null && (
                              <span className="maint-meta-item">
                                Odometer: {formatDistance(r.odometer, preferences.distanceUnit)}
                              </span>
                            )}
                            {r.cost != null && r.cost > 0 && (
                              <span className="maint-meta-item maint-cost">
                                {new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency }).format(r.cost)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="maint-card-receipt-section">
                          <span className="maint-receipt-label">Receipt</span>
                          <div className="maint-card-receipt">
                            {r.receiptPath ? (
                              isImageReceipt(r) ? (
                                <button
                                  type="button"
                                  className="maint-receipt-thumb"
                                  onClick={() => handleViewReceipt(r.id)}
                                  title="View receipt"
                                >
                                  <ReceiptThumbnail recordId={r.id} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-link"
                                  onClick={() => handleViewReceipt(r.id)}
                                >
                                  📄 View receipt
                                </button>
                              )
                            ) : null}
                            <label className="btn-link" style={{ cursor: 'pointer', marginBottom: 0 }}>
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,image/*,application/pdf"
                                onChange={(e) => handleReceiptUpload(r.id, e)}
                                disabled={uploadingReceiptId === r.id}
                                style={{ display: 'none' }}
                              />
                              {uploadingReceiptId === r.id ? 'Uploading…' : r.receiptPath ? 'Replace' : 'Attach receipt'}
                            </label>
                          </div>
                        </div>
                        <div className="maint-card-actions">
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => openEdit(r)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-link danger"
                            onClick={() => handleDeleteRecord(r.id)}
                            disabled={deletingId === r.id}
                          >
                            {deletingId === r.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editingRecord && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeEditForm()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-edit-title"
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header">
              <h3 id="modal-edit-title" className="modal-dialog-title">Edit record</h3>
              <button type="button" className="modal-dialog-close" onClick={closeEditForm} aria-label="Close">×</button>
            </div>
            <div className="modal-dialog-body">
              <form onSubmit={handleEditSubmit} className="form form-grid maint-form">
            <div className="form-row">
              <label htmlFor="edit-type">Type</label>
              <select
                id="edit-type"
                value={editType}
                onChange={(e) => setEditType(e.target.value as MaintenanceType)}
                className="form-select"
                disabled={editSubmitting}
              >
                {MAINTENANCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="edit-date">Date</label>
              <input
                id="edit-date"
                type="datetime-local"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className=""
                disabled={editSubmitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="edit-odometer">Odometer (optional)</label>
              <input
                id="edit-odometer"
                type="number"
                min={0}
                step={1}
                value={editOdometer}
                onChange={(e) => setEditOdometer(e.target.value)}
                placeholder={preferences.distanceUnit === 'mi' ? 'e.g. 28000 mi' : 'e.g. 45000 km'}
                disabled={editSubmitting}
              />
            </div>
            <div className="form-row">
              <label htmlFor="edit-cost">Cost (optional)</label>
              <input
                id="edit-cost"
                type="number"
                min={0}
                step={0.01}
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                placeholder="e.g. 150.00"
                disabled={editSubmitting}
              />
            </div>
            <div className="form-row form-row-span">
              <label htmlFor="edit-notes">Notes (optional)</label>
              <input
                id="edit-notes"
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="e.g. Oil change"
                maxLength={1000}
                disabled={editSubmitting}
              />
            </div>
            {editError && <p className="form-error form-row-span">{editError}</p>}
            <div className="form-row form-row-span" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                {editSubmitting ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn" onClick={closeEditForm}>
                Cancel
              </button>
            </div>
          </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Thumbnail component that fetches receipt image and shows a small preview */
function ReceiptThumbnail({ recordId }: { recordId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let url: string | null = null;
    getMaintenanceReceiptBlobUrl(recordId)
      .then((blobUrl) => {
        url = blobUrl;
        setSrc(blobUrl);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [recordId]);

  if (loading) return <div className="maint-thumb-placeholder">…</div>;
  if (!src) return null;
  return (
    <img
      src={src}
      alt="Receipt"
      className="maint-thumb-img"
      loading="lazy"
    />
  );
}
