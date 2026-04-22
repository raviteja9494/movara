import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  type UpdateVehiclePayload,
} from '../api/vehicles';
import { fetchDevices, type Device } from '../api/devices';
import { fetchMaintenanceByVehicle, type MaintenanceRecord } from '../api/maintenance';
import {
  fetchVehicleRecords,
  createVehicleRecord,
  updateVehicleRecord,
  deleteVehicleRecord,
  uploadVehicleRecordAttachment,
  getVehicleRecordAttachmentBlobUrl,
  type VehicleRecord,
  type VehicleRecordType,
  type VehicleRecordSubtype,
  type VehicleRecordReminderMode,
} from '../api/vehicleRecords';
import { getErrorMessage } from '../utils/getErrorMessage';
import { usePreferences } from '../settings/PreferencesContext';
import { formatDistance, formatFuelVolume, formatFuelEconomy, toKm, toLiters } from '../utils/units';
import { datetimeLocalToIso, formatIsoForDatetimeLocal } from '../utils/datetimeLocal';

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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatEstimatedDelta(
  currentKm: number | null,
  estimatedKm: number | null,
  distanceUnit: 'km' | 'mi',
): string | null {
  if (currentKm == null || estimatedKm == null) return null;
  const diff = estimatedKm - currentKm;
  if (Math.abs(diff) < 0.05) return 'Aligned with manual reading';
  const distance = formatDistance(Math.abs(diff), distanceUnit);
  return diff > 0 ? `${distance} above manual` : `${distance} below manual`;
}

function trackerOdometerKm(device: Device | null | undefined): number | null {
  if (!device) return null;
  const attrs = device.lastAttributes ?? {};
  const totalMileage = attrs.gt06_total_mileage_km;
  if (typeof totalMileage === 'number' && Number.isFinite(totalMileage)) {
    return totalMileage;
  }
  const rawMileage = attrs.gt06_mileage_raw;
  if (typeof rawMileage === 'number' && Number.isFinite(rawMileage)) {
    return rawMileage / 1000;
  }
  const genericOdometer = attrs.odometer;
  if (typeof genericOdometer === 'number' && Number.isFinite(genericOdometer)) {
    return genericOdometer;
  }
  return null;
}

function trackerOdometerSource(device: Device | null | undefined): string | null {
  if (!device) return null;
  const attrs = device.lastAttributes ?? {};
  if (typeof attrs.gt06_total_mileage_km === 'number') return 'Tracker mileage command';
  if (typeof attrs.gt06_mileage_raw === 'number') return 'GT06 GPS packets';
  if (typeof attrs.odometer === 'number') return 'Tracker telemetry';
  return null;
}

function formatOdometerDelta(
  baseKm: number | null,
  compareKm: number | null,
  distanceUnit: 'km' | 'mi',
  compareLabel: string,
): string | null {
  if (baseKm == null || compareKm == null) return null;
  const diff = compareKm - baseKm;
  if (Math.abs(diff) < 0.05) return `${compareLabel} aligned`;
  const distance = formatDistance(Math.abs(diff), distanceUnit);
  return diff > 0 ? `${compareLabel} ${distance} above` : `${compareLabel} ${distance} below`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));
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

type VehicleSection = 'overview' | 'fuel' | 'records' | 'trips';
type TimeFilterPreset = 'all' | 'this_month' | 'last_30_days' | 'this_year' | 'custom';
type RecordScope = 'all' | 'document';

interface ReminderItem {
  id: string;
  title: string;
  detail: string;
  severity: 'overdue' | 'due' | 'info';
  section: VehicleSection;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function getPresetDateRange(
  preset: TimeFilterPreset,
  fromDate: string,
  toDate: string,
): { fromMs: number | null; toMs: number | null } {
  const now = new Date();
  if (preset === 'all') return { fromMs: null, toMs: null };
  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { fromMs: from.getTime(), toMs: endOfDay(now).getTime() };
  }
  if (preset === 'last_30_days') {
    const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { fromMs: startOfDay(from).getTime(), toMs: endOfDay(now).getTime() };
  }
  if (preset === 'this_year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { fromMs: from.getTime(), toMs: endOfDay(now).getTime() };
  }
  const fromMs = fromDate ? startOfDay(new Date(fromDate)).getTime() : null;
  const toMs = toDate ? endOfDay(new Date(toDate)).getTime() : null;
  return {
    fromMs: Number.isNaN(fromMs ?? NaN) ? null : fromMs,
    toMs: Number.isNaN(toMs ?? NaN) ? null : toMs,
  };
}

function withinDateRange(iso: string, range: { fromMs: number | null; toMs: number | null }): boolean {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return false;
  if (range.fromMs != null && at < range.fromMs) return false;
  if (range.toMs != null && at > range.toMs) return false;
  return true;
}

const RECORD_TYPE_OPTIONS: { value: VehicleRecordType; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'document', label: 'Document' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'expense', label: 'Expense' },
  { value: 'accessory', label: 'Accessory' },
];

const RECORD_SUBTYPE_OPTIONS: { value: VehicleRecordSubtype; label: string; type: VehicleRecordType }[] = [
  { value: 'service', label: 'Service', type: 'maintenance' },
  { value: 'repair', label: 'Repair', type: 'maintenance' },
  { value: 'inspection', label: 'Inspection', type: 'maintenance' },
  { value: 'other', label: 'Other maintenance', type: 'maintenance' },
  { value: 'pollution_check', label: 'Pollution check', type: 'document' },
  { value: 'registration', label: 'Registration', type: 'document' },
  { value: 'permit', label: 'Permit', type: 'document' },
  { value: 'warranty', label: 'Warranty', type: 'document' },
  { value: 'custom', label: 'Custom document', type: 'document' },
  { value: 'sim_recharge', label: 'SIM recharge', type: 'subscription' },
  { value: 'custom', label: 'Custom subscription', type: 'subscription' },
  { value: 'custom', label: 'General expense', type: 'expense' },
  { value: 'tracker_purchase', label: 'Tracker purchase', type: 'accessory' },
  { value: 'accessory_purchase', label: 'Accessory purchase', type: 'accessory' },
];

function recordSubtypeLabel(subtype: string | null): string {
  if (!subtype) return 'Record';
  const found = RECORD_SUBTYPE_OPTIONS.find((option) => option.value === subtype);
  if (found) return found.label;
  return subtype.replace(/_/g, ' ');
}

function computeRecordDueSummary(
  record: VehicleRecord,
  latestRecordedOdometer?: number | null,
  distanceUnit: 'km' | 'mi' = 'km',
): { label: string; severity: 'overdue' | 'due' | 'info' } | null {
  const dueIso =
    record.reminderMode === 'on_date'
      ? record.validUntil ?? record.date
      : record.reminderMode === 'recurring_date' && record.recurringIntervalDays
        ? new Date(new Date(record.date).getTime() + record.recurringIntervalDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
  const days = dueIso ? daysUntil(dueIso) : null;
  if (days != null) {
    if (days < 0) return { label: `${Math.abs(days)}d overdue`, severity: 'overdue' };
    if (days <= (record.reminderDaysBefore ?? 30)) return { label: days === 0 ? 'Due today' : `Due in ${days}d`, severity: 'due' };
  }
  if (
    record.reminderMode === 'recurring_odometer' &&
    record.recurringIntervalKm != null &&
    record.odometer != null &&
    latestRecordedOdometer != null
  ) {
    const remainingKm = record.recurringIntervalKm - (latestRecordedOdometer - record.odometer);
    const warnKm = Math.min(1000, Math.max(250, Math.round(record.recurringIntervalKm * 0.1)));
    if (remainingKm <= 0) return { label: `${formatDistance(Math.abs(remainingKm), distanceUnit)}` + ' overdue', severity: 'overdue' };
    if (remainingKm <= warnKm) return { label: `Due in ${formatDistance(remainingKm, distanceUnit)}`, severity: 'due' };
  }
  return null;
}

function getVehicleSection(value: string | null): VehicleSection {
  if (value === 'maintenance' || value === 'documents') {
    return 'records';
  }
  if (value === 'fuel' || value === 'records' || value === 'trips') {
    return value;
  }
  return 'overview';
}

function formatReminderDays(days: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  return `due in ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Mileage (fuel economy): km/L = distance since previous fill / liters added at this fill.
 * Records sorted by date ascending; each fill uses odometer - previous odometer as distance.
 */
function avgFuelEconomyKmPerL(records: FuelRecord[]): number | null {
  if (records.length < 2) return null;
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
  const kmPerL = totalDistance / totalLiters;
  return Number.isFinite(kmPerL) && kmPerL > 0 ? kmPerL : null;
}

/** Last fill economy L/100 km: most recent fill's quantity / distance since previous fill × 100. */
function lastFillKmPerL(records: FuelRecord[]): number | null {
  if (records.length < 2) return null;
  const sorted = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const curr = sorted[0];
  const prev = sorted[1];
  const dist = curr.odometer - prev.odometer;
  if (dist <= 0 || curr.fuelQuantity <= 0) return null;
  const kmPerL = dist / curr.fuelQuantity;
  return Number.isFinite(kmPerL) && kmPerL > 0 ? kmPerL : null;
}

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { preferences } = usePreferences();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [vehicleRecords, setVehicleRecords] = useState<VehicleRecord[]>([]);
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
  const [editInsurance, setEditInsurance] = useState(false);
  const [savingInsurance, setSavingInsurance] = useState(false);
  const [showAddRecordForm, setShowAddRecordForm] = useState(false);
  const [recordType, setRecordType] = useState<VehicleRecordType>('maintenance');
  const [recordSubtype, setRecordSubtype] = useState<VehicleRecordSubtype>('service');
  const [recordTitle, setRecordTitle] = useState('');
  const [recordDate, setRecordDate] = useState('');
  const [recordValidUntil, setRecordValidUntil] = useState('');
  const [recordAmount, setRecordAmount] = useState('');
  const [recordOdometer, setRecordOdometer] = useState('');
  const [recordNotes, setRecordNotes] = useState('');
  const [recordProvider, setRecordProvider] = useState('');
  const [recordReferenceNumber, setRecordReferenceNumber] = useState('');
  const [recordReminderMode, setRecordReminderMode] = useState<VehicleRecordReminderMode>('none');
  const [recordReminderDaysBefore, setRecordReminderDaysBefore] = useState('30');
  const [recordRecurringDays, setRecordRecurringDays] = useState('');
  const [recordRecurringKm, setRecordRecurringKm] = useState('');
  const [recordAttachmentFile, setRecordAttachmentFile] = useState<File | null>(null);
  const [recordSubmitting, setRecordSubmitting] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [uploadingRecordAttachmentId, setUploadingRecordAttachmentId] = useState<string | null>(null);
  const [editingVehicleRecord, setEditingVehicleRecord] = useState<VehicleRecord | null>(null);
  const [viewingVehicleRecord, setViewingVehicleRecord] = useState<VehicleRecord | null>(null);

  const [showAddFuelForm, setShowAddFuelForm] = useState(false);
  const [activeSection, setActiveSection] = useState<VehicleSection>(() => getVehicleSection(searchParams.get('tab')));
  const [formDate, setFormDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [formOdometer, setFormOdometer] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formRate, setFormRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [deletingFuelId, setDeletingFuelId] = useState<string | null>(null);
  const [fuelRecordLimit, setFuelRecordLimit] = useState<number>(24);
  const [fuelTimePreset, setFuelTimePreset] = useState<TimeFilterPreset>('all');
  const [fuelFromDate, setFuelFromDate] = useState('');
  const [fuelToDate, setFuelToDate] = useState('');
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
  const [insThirdPartyStart, setInsThirdPartyStart] = useState('');
  const [insThirdPartyEnd, setInsThirdPartyEnd] = useState('');
  const [insThirdPartyProvider, setInsThirdPartyProvider] = useState('');
  const [insThirdPartyNumber, setInsThirdPartyNumber] = useState('');
  const [insOwnStart, setInsOwnStart] = useState('');
  const [insOwnEnd, setInsOwnEnd] = useState('');
  const [insOwnProvider, setInsOwnProvider] = useState('');
  const [insOwnNumber, setInsOwnNumber] = useState('');
  const [recordTimePreset, setRecordTimePreset] = useState<TimeFilterPreset>('all');
  const [recordFromDate, setRecordFromDate] = useState('');
  const [recordToDate, setRecordToDate] = useState('');
  const [recordScope, setRecordScope] = useState<RecordScope>('all');
  const navigate = useNavigate();
  const handledQuickFuelOpenRef = useRef(false);

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
        setInsThirdPartyStart(v.thirdPartyInsuranceStart?.slice(0, 10) ?? '');
        setInsThirdPartyEnd(v.thirdPartyInsuranceEnd?.slice(0, 10) ?? '');
        setInsThirdPartyProvider(v.thirdPartyInsuranceProvider ?? '');
        setInsThirdPartyNumber(v.thirdPartyInsuranceNumber ?? '');
        setInsOwnStart(v.ownInsuranceStart?.slice(0, 10) ?? '');
        setInsOwnEnd(v.ownInsuranceEnd?.slice(0, 10) ?? '');
        setInsOwnProvider(v.ownInsuranceProvider ?? '');
        setInsOwnNumber(v.ownInsuranceNumber ?? '');
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
    const tab = getVehicleSection(searchParams.get('tab'));
    setActiveSection(tab);
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get('addFuel') !== '1' || handledQuickFuelOpenRef.current) {
      return;
    }
    handledQuickFuelOpenRef.current = true;
    setActiveSection('fuel');
    setShowAddFuelForm(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'fuel');
      next.delete('addFuel');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const firstSubtype = RECORD_SUBTYPE_OPTIONS.find((option) => option.type === recordType)?.value;
    if (!firstSubtype) return;
    const stillValid = RECORD_SUBTYPE_OPTIONS.some((option) => option.type === recordType && option.value === recordSubtype);
    if (!stillValid) {
      setRecordSubtype(firstSubtype);
    }
  }, [recordType, recordSubtype]);

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

  useEffect(() => {
    if (!id) return;
    fetchVehicleRecords({ vehicleId: id, page: 1, limit: 100 })
      .then((res) => setVehicleRecords(res.data))
      .catch(() => setVehicleRecords([]));
  }, [id]);

  const fuelDateRange = useMemo(
    () => getPresetDateRange(fuelTimePreset, fuelFromDate, fuelToDate),
    [fuelTimePreset, fuelFromDate, fuelToDate],
  );
  const filteredFuelRecords = useMemo(
    () => fuelRecords.filter((record) => withinDateRange(record.date, fuelDateRange)),
    [fuelRecords, fuelDateRange],
  );
  const avgFuelEconomy = useMemo(() => avgFuelEconomyKmPerL(filteredFuelRecords), [filteredFuelRecords]);
  const lastFillEconomy = useMemo(() => lastFillKmPerL(filteredFuelRecords), [filteredFuelRecords]);
  const distanceByRecordId = useMemo(() => {
    const sorted = [...filteredFuelRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const map: Record<string, number> = {};
    for (let i = 1; i < sorted.length; i++) {
      const dist = sorted[i].odometer - sorted[i - 1].odometer;
      if (dist > 0) {
        map[sorted[i].id] = dist;
      }
    }
    return map;
  }, [filteredFuelRecords]);
  const mileageByRecordId = useMemo(() => {
    const sorted = [...filteredFuelRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const map: Record<string, number> = {};
    for (let i = 1; i < sorted.length; i++) {
      const dist = sorted[i].odometer - sorted[i - 1].odometer;
      if (dist > 0 && sorted[i].fuelQuantity > 0) {
        const kmPerL = dist / sorted[i].fuelQuantity;
        if (Number.isFinite(kmPerL) && kmPerL > 0) map[sorted[i].id] = kmPerL;
      }
    }
    return map;
  }, [filteredFuelRecords]);
  const lastFillDistance = useMemo(() => {
    const sorted = [...filteredFuelRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sorted.length < 2) return null;
    const dist = sorted[0].odometer - sorted[1].odometer;
    return dist > 0 ? dist : null;
  }, [filteredFuelRecords]);
  const lastMaintenance = useMemo(
    () => [...maintenanceRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null,
    [maintenanceRecords],
  );
  const lastServiceRecord = useMemo(
    () => [...maintenanceRecords]
      .filter((record) => record.type === 'service' || record.type === 'inspection')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null,
    [maintenanceRecords],
  );
  const lastFuelRecord = useMemo(
    () => [...filteredFuelRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null,
    [filteredFuelRecords],
  );
  const documentRecords = useMemo(
    () => vehicleRecords.filter((record) => record.type === 'document'),
    [vehicleRecords],
  );
  const recordDateRange = useMemo(
    () => getPresetDateRange(recordTimePreset, recordFromDate, recordToDate),
    [recordTimePreset, recordFromDate, recordToDate],
  );
  const filteredVehicleRecords = useMemo(() => {
    return vehicleRecords.filter((record) => {
      if (!withinDateRange(record.date, recordDateRange)) return false;
      if (recordScope === 'document' && record.type !== 'document') return false;
      return true;
    });
  }, [vehicleRecords, recordDateRange, recordScope]);
  const filteredDocumentCount = useMemo(
    () => filteredVehicleRecords.filter((record) => record.type === 'document').length,
    [filteredVehicleRecords],
  );
  const recurringRecords = useMemo(
    () => vehicleRecords.filter((record) => record.type !== 'document'),
    [vehicleRecords],
  );
  const totalFuelSpend = useMemo(
    () => filteredFuelRecords.reduce((sum, record) => sum + (record.fuelCost ?? 0), 0),
    [filteredFuelRecords],
  );
  const totalFuelVolume = useMemo(
    () => filteredFuelRecords.reduce((sum, record) => sum + record.fuelQuantity, 0),
    [filteredFuelRecords],
  );
  const linkedDevice = useMemo(
    () => (vehicle?.deviceId ? devices.find((d) => d.id === vehicle.deviceId) ?? null : null),
    [devices, vehicle?.deviceId],
  );
  const trackerOdometer = useMemo(
    () => trackerOdometerKm(linkedDevice),
    [linkedDevice],
  );
  const trackerOdometerLabel = useMemo(
    () => trackerOdometerSource(linkedDevice),
    [linkedDevice],
  );
  const latestRecordedOdometer = lastFuelRecord?.odometer ?? vehicle?.currentOdometer ?? null;
  const estimatedDelta = formatEstimatedDelta(
    vehicle?.currentOdometer ?? null,
    vehicle?.estimatedOdometerKm ?? null,
    preferences.distanceUnit,
  );
  const trackerDelta = formatOdometerDelta(
    vehicle?.currentOdometer ?? null,
    trackerOdometer,
    preferences.distanceUnit,
    'Tracker',
  );

  const maintenanceSpend = useMemo(
    () => maintenanceRecords.reduce((sum, record) => sum + (record.cost ?? 0), 0),
    [maintenanceRecords],
  );
  const maintenanceReminderItems = useMemo<ReminderItem[]>(() => {
    const items: ReminderItem[] = [];
    if (!lastServiceRecord) {
      items.push({
        id: 'maintenance-history',
        title: 'Add first service record',
        detail: 'No service or inspection history has been recorded yet.',
        severity: 'info',
        section: 'records',
      });
      return items;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const serviceDays = Math.floor((Date.now() - new Date(lastServiceRecord.date).getTime()) / msPerDay);
    const serviceDistance = lastServiceRecord.odometer != null && latestRecordedOdometer != null
      ? latestRecordedOdometer - lastServiceRecord.odometer
      : null;

    if (serviceDays >= 180) {
      items.push({
        id: 'maintenance-time',
        title: 'Service review overdue',
        detail: `Last service/inspection was ${serviceDays} days ago on ${formatDate(lastServiceRecord.date)}.`,
        severity: 'overdue',
        section: 'records',
      });
    } else if (serviceDays >= 150) {
      items.push({
        id: 'maintenance-time',
        title: 'Service review due soon',
        detail: `Last service/inspection was ${serviceDays} days ago on ${formatDate(lastServiceRecord.date)}.`,
        severity: 'due',
        section: 'records',
      });
    }

    if (serviceDistance != null && serviceDistance >= 5000) {
      items.push({
        id: 'maintenance-distance',
        title: 'Distance-based service overdue',
        detail: `${formatDistance(serviceDistance, preferences.distanceUnit)} since the last service record.`,
        severity: 'overdue',
        section: 'records',
      });
    } else if (serviceDistance != null && serviceDistance >= 4000) {
      items.push({
        id: 'maintenance-distance',
        title: 'Distance-based service due soon',
        detail: `${formatDistance(serviceDistance, preferences.distanceUnit)} since the last service record.`,
        severity: 'due',
        section: 'records',
      });
    }

    return items;
  }, [lastServiceRecord, latestRecordedOdometer, preferences.distanceUnit]);
  const insuranceReminderItems = useMemo<ReminderItem[]>(() => {
    const items: ReminderItem[] = [];
    for (const candidate of documentRecords) {
      const dueSummary = computeRecordDueSummary(candidate, latestRecordedOdometer, preferences.distanceUnit);
      const days = candidate.validUntil ? daysUntil(candidate.validUntil) : null;
      if (!dueSummary || days == null) continue;
      items.push({
        id: candidate.id,
        title: candidate.title,
        detail: candidate.validUntil
          ? `${formatDate(candidate.validUntil)} · ${formatReminderDays(days)}`
          : dueSummary.label,
        severity: dueSummary.severity === 'overdue' ? 'overdue' : 'due',
        section: 'records',
      });
    }
    return items;
  }, [documentRecords]);

  const recurringReminderItems = useMemo<ReminderItem[]>(() => {
    const items: ReminderItem[] = [];
    for (const record of recurringRecords) {
      const dueSummary = computeRecordDueSummary(record, latestRecordedOdometer, preferences.distanceUnit);
      if (!dueSummary) continue;
      items.push({
        id: record.id,
        title: record.title,
        detail: dueSummary.label,
        severity: dueSummary.severity === 'overdue' ? 'overdue' : 'due',
        section: 'records',
      });
    }
    return items;
  }, [latestRecordedOdometer, preferences.distanceUnit, recurringRecords]);
  const reminderItems = useMemo(
    () => [...insuranceReminderItems, ...recurringReminderItems, ...maintenanceReminderItems],
    [insuranceReminderItems, recurringReminderItems, maintenanceReminderItems],
  );
  const filteredDueSoonCount = useMemo(() => {
    return filteredVehicleRecords.reduce((count, record) => {
      const dueSummary = computeRecordDueSummary(record, latestRecordedOdometer, preferences.distanceUnit);
      if (!dueSummary) return count;
      return dueSummary.severity === 'due' || dueSummary.severity === 'overdue' ? count + 1 : count;
    }, 0);
  }, [filteredVehicleRecords, latestRecordedOdometer, preferences.distanceUnit]);
  const openSection = useCallback((section: VehicleSection) => {
    setActiveSection(section);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', section);
      next.delete('addFuel');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSaveDetails = async () => {
    if (!id || !vehicle) return;
    setSavingDetails(true);
    try {
      const yearNum = editYear.trim() ? parseInt(editYear, 10) : null;
      const odoNum = editOdometer.trim() ? parseInt(editOdometer, 10) : null;
      const payload: UpdateVehiclePayload = {
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
        thirdPartyInsuranceStart: insThirdPartyStart ? `${insThirdPartyStart}T00:00:00.000Z` : null,
        thirdPartyInsuranceEnd: insThirdPartyEnd ? `${insThirdPartyEnd}T00:00:00.000Z` : null,
        thirdPartyInsuranceProvider: insThirdPartyProvider.trim() || null,
        thirdPartyInsuranceNumber: insThirdPartyNumber.trim() || null,
        ownInsuranceStart: insOwnStart ? `${insOwnStart}T00:00:00.000Z` : null,
        ownInsuranceEnd: insOwnEnd ? `${insOwnEnd}T00:00:00.000Z` : null,
        ownInsuranceProvider: insOwnProvider.trim() || null,
        ownInsuranceNumber: insOwnNumber.trim() || null,
      };
      const res = await updateVehicle(id, payload);
      setVehicle(res.vehicle);
      setEditDetails(false);
    } catch {
      // ignore
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveInsurance = async () => {
    if (!id) return;
    setSavingInsurance(true);
    try {
      const res = await updateVehicle(id, {
        thirdPartyInsuranceStart: insThirdPartyStart ? `${insThirdPartyStart}T00:00:00.000Z` : null,
        thirdPartyInsuranceEnd: insThirdPartyEnd ? `${insThirdPartyEnd}T00:00:00.000Z` : null,
        thirdPartyInsuranceProvider: insThirdPartyProvider.trim() || null,
        thirdPartyInsuranceNumber: insThirdPartyNumber.trim() || null,
        ownInsuranceStart: insOwnStart ? `${insOwnStart}T00:00:00.000Z` : null,
        ownInsuranceEnd: insOwnEnd ? `${insOwnEnd}T00:00:00.000Z` : null,
        ownInsuranceProvider: insOwnProvider.trim() || null,
        ownInsuranceNumber: insOwnNumber.trim() || null,
      });
      setVehicle(res.vehicle);
      setEditInsurance(false);
    } finally {
      setSavingInsurance(false);
    }
  };

  const resetRecordForm = useCallback(() => {
    setRecordType('maintenance');
    setRecordSubtype('service');
    setRecordTitle('');
    setRecordDate('');
    setRecordValidUntil('');
    setRecordAmount('');
    setRecordOdometer('');
    setRecordNotes('');
    setRecordProvider('');
    setRecordReferenceNumber('');
    setRecordReminderMode('none');
    setRecordReminderDaysBefore('30');
    setRecordRecurringDays('');
    setRecordRecurringKm('');
    setRecordAttachmentFile(null);
    setRecordError(null);
    setEditingVehicleRecord(null);
  }, []);

  const handleSaveVehicleRecord = async () => {
    if (!id) return;
    if (!recordTitle.trim() || !recordDate.trim()) {
      setRecordError('Title and date are required');
      return;
    }
    setRecordSubmitting(true);
    setRecordError(null);
    try {
      const payload = {
        vehicleId: id,
        type: recordType,
        subtype: recordSubtype,
        title: recordTitle.trim(),
        date: datetimeLocalToIso(recordDate) ?? recordDate,
        validUntil: recordValidUntil ? `${recordValidUntil}T00:00:00.000Z` : null,
        amount: recordAmount.trim() ? parseFloat(recordAmount) : null,
        odometer: recordOdometer.trim() ? Math.round(toKm(parseFloat(recordOdometer), preferences.distanceUnit)) : null,
        notes: recordNotes.trim() || null,
        provider: recordProvider.trim() || null,
        referenceNumber: recordReferenceNumber.trim() || null,
        reminderMode: recordReminderMode,
        reminderDaysBefore: recordReminderMode === 'on_date' || recordReminderMode === 'recurring_date'
          ? parseInt(recordReminderDaysBefore || '30', 10)
          : null,
        recurringIntervalDays: recordReminderMode === 'recurring_date' && recordRecurringDays.trim()
          ? parseInt(recordRecurringDays, 10)
          : null,
        recurringIntervalKm: recordReminderMode === 'recurring_odometer' && recordRecurringKm.trim()
          ? Math.round(toKm(parseFloat(recordRecurringKm), preferences.distanceUnit))
          : null,
      };
      const saved = editingVehicleRecord
        ? await updateVehicleRecord(editingVehicleRecord.id, payload)
        : await createVehicleRecord(payload);
      let nextRecord = saved.record;
      if (recordAttachmentFile) {
        setUploadingRecordAttachmentId(saved.record.id);
        const uploaded = await uploadVehicleRecordAttachment(saved.record.id, recordAttachmentFile);
        nextRecord = uploaded.record;
      }
      setVehicleRecords((prev) =>
        editingVehicleRecord
          ? prev.map((record) => (record.id === nextRecord.id ? nextRecord : record)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          : [nextRecord, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      );
      resetRecordForm();
      closeAddRecordForm();
      load();
    } catch (err) {
      setRecordError(getErrorMessage(err, editingVehicleRecord ? 'Failed to update record' : 'Failed to add record'));
    } finally {
      setUploadingRecordAttachmentId(null);
      setRecordSubmitting(false);
    }
  };

  const openEditVehicleRecord = (record: VehicleRecord) => {
    setViewingVehicleRecord(null);
    setEditingVehicleRecord(record);
    setRecordType(record.type);
    setRecordSubtype(record.subtype ?? 'custom');
    setRecordTitle(record.title);
    setRecordDate(formatIsoForDatetimeLocal(record.date));
    setRecordValidUntil(record.validUntil ? record.validUntil.slice(0, 10) : '');
    setRecordAmount(record.amount != null ? String(record.amount) : '');
    setRecordOdometer(
      record.odometer != null
        ? String(Math.round((preferences.distanceUnit === 'mi' ? record.odometer / 1.609344 : record.odometer) * 100) / 100)
        : '',
    );
    setRecordNotes(record.notes ?? '');
    setRecordProvider(record.provider ?? '');
    setRecordReferenceNumber(record.referenceNumber ?? '');
    setRecordReminderMode(record.reminderMode ?? 'none');
    setRecordReminderDaysBefore(record.reminderDaysBefore != null ? String(record.reminderDaysBefore) : '30');
    setRecordRecurringDays(record.recurringIntervalDays != null ? String(record.recurringIntervalDays) : '');
    setRecordRecurringKm(
      record.recurringIntervalKm != null
        ? String(Math.round((preferences.distanceUnit === 'mi' ? record.recurringIntervalKm / 1.609344 : record.recurringIntervalKm) * 100) / 100)
        : '',
    );
    setRecordAttachmentFile(null);
    setRecordError(null);
    setShowAddRecordForm(true);
  };

  const openViewVehicleRecord = (record: VehicleRecord) => {
    setViewingVehicleRecord(record);
  };

  const handleDeleteVehicleRecord = async (recordId: string) => {
    if (!window.confirm('Delete this vehicle record?')) return;
    setDeletingRecordId(recordId);
    try {
      await deleteVehicleRecord(recordId);
      setVehicleRecords((prev) => prev.filter((record) => record.id !== recordId));
      load();
    } catch (err) {
      setRecordError(getErrorMessage(err, 'Failed to delete record'));
    } finally {
      setDeletingRecordId(null);
    }
  };

  const handleViewVehicleRecordAttachment = async (recordId: string) => {
    try {
      const url = await getVehicleRecordAttachmentBlobUrl(recordId);
      window.open(url, '_blank', 'noopener');
    } catch {
      // ignore
    }
  };

  const closeAddFuelForm = useCallback(() => {
    setShowAddFuelForm(false);
    setFormError(null);
  }, []);

  const closeAddRecordForm = useCallback(() => {
    setShowAddRecordForm(false);
    setRecordError(null);
    setEditingVehicleRecord(null);
  }, []);

  const closeEditFuelForm = useCallback(() => {
    setEditingFuelRecord(null);
    setEditFuelError(null);
  }, []);

  const openEditFuel = (r: FuelRecord) => {
    setEditingFuelRecord(r);
    setEditFuelDate(formatIsoForDatetimeLocal(r.date));
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
    const dateIso = datetimeLocalToIso(editFuelDate);
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
    if (!dateIso) {
      setEditFuelError('Enter a valid date and time.');
      return;
    }
    const payload: UpdateFuelRecordPayload = {
      date: dateIso,
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
      await load();
    } catch (err) {
      setEditFuelError(getErrorMessage(err, 'Failed to update fuel record'));
    } finally {
      setEditFuelSubmitting(false);
    }
  };

  const closeEditDetails = useCallback(() => {
    setEditDetails(false);
  }, []);

  const closeEditInsurance = useCallback(() => {
    setEditInsurance(false);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddFuelForm) closeAddFuelForm();
        if (showAddRecordForm) closeAddRecordForm();
        if (editDetails) closeEditDetails();
        if (editInsurance) closeEditInsurance();
        if (editingFuelRecord) closeEditFuelForm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAddFuelForm, showAddRecordForm, editDetails, editInsurance, editingFuelRecord, closeAddFuelForm, closeAddRecordForm, closeEditDetails, closeEditInsurance, closeEditFuelForm]);

  const handleAddFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const dateIso = datetimeLocalToIso(formDate);
    const odoRaw = formOdometer.trim() ? parseFloat(formOdometer) : undefined;
    const qtyRaw = formQuantity.trim() ? parseFloat(formQuantity) : undefined;
    const odometer = odoRaw != null && !Number.isNaN(odoRaw) ? Math.round(toKm(odoRaw, preferences.distanceUnit)) : undefined;
    const quantity = qtyRaw != null && !Number.isNaN(qtyRaw) ? toLiters(qtyRaw, preferences.fuelVolumeUnit) : undefined;
    const cost = formCost.trim() ? parseFloat(formCost) : undefined;
    const rate = formRate.trim() ? parseFloat(formRate) : undefined;
    if (!dateIso || odometer == null || odometer < 0 || !quantity || quantity <= 0) {
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
        date: dateIso,
        odometer,
        fuelQuantity: quantity,
      };
      if (cost != null) payload.fuelCost = cost;
      if (rate != null) payload.fuelRate = rate;
      const res = await createFuelRecord(id, payload);
      setFuelRecords((prev) => [res.fuelRecord, ...prev]);
      await load();
      setShowAddFuelForm(false);
      setFormDate(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      });
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
    const sorted = [...filteredFuelRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const limit = fuelRecordLimit >= 999 ? sorted.length : fuelRecordLimit;
    return sorted.slice(0, limit).reverse();
  }, [filteredFuelRecords, fuelRecordLimit]);
  const maxCost = useMemo(() => Math.max(...chartRecords.map((r) => r.fuelCost ?? 0), 1), [chartRecords]);
  const maxMileage = useMemo(() => {
    const values = chartRecords.map((r) => mileageByRecordId[r.id]).filter((v): v is number => v != null);
    return values.length > 0 ? Math.max(...values) : 1;
  }, [chartRecords, mileageByRecordId]);
  const chartHeight = 160;

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
      await load();
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
                <span><strong>Manual odometer:</strong> {formatDistance(vehicle.currentOdometer, preferences.distanceUnit)}</span>
              )}
              {trackerOdometer != null && (
                <span><strong>Tracker odometer:</strong> {formatDistance(trackerOdometer, preferences.distanceUnit)}</span>
              )}
              {vehicle.estimatedOdometerKm != null && (
                <span><strong>Estimated odometer:</strong> {formatDistance(vehicle.estimatedOdometerKm, preferences.distanceUnit)}</span>
              )}
              {vehicle.estimatedOdometerCalibratedAt && (
                <span><strong>Estimated calibrated:</strong> {formatDateTime(vehicle.estimatedOdometerCalibratedAt)}</span>
              )}
              {trackerOdometerLabel && <span><strong>Tracker source:</strong> {trackerOdometerLabel}</span>}
              {trackerDelta && <span><strong>Tracker delta:</strong> {trackerDelta}</span>}
              {estimatedDelta && <span><strong>Estimate delta:</strong> {estimatedDelta}</span>}
              {vehicle.fuelType && <span><strong>Fuel:</strong> {vehicle.fuelType}</span>}
              {vehicle.deviceId && (() => {
                const dev = devices.find((d) => d.id === vehicle.deviceId);
                return <span><strong>Device:</strong> {dev ? deviceLabel(dev) : 'Linked'}</span>;
              })()}
              <span><strong>Icon:</strong> {vehicleIconEmoji(vehicle.icon)}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditDetails(true)}>
                Edit vehicle data
              </button>
            </div>
          </div>
        ) : null}

        <div className="vehicle-section-tabs" style={{ marginTop: '1rem' }}>
          {([
            ['overview', 'Overview'],
            ['fuel', 'Fuel'],
            ['records', 'Records'],
            ['trips', 'Trips'],
          ] as Array<[VehicleSection, string]>).map(([section, label]) => (
            <button
              key={section}
              type="button"
              className={`vehicle-section-tab${activeSection === section ? ' vehicle-section-tab--active' : ''}`}
              onClick={() => openSection(section)}
            >
              {label}
            </button>
          ))}
        </div>

        {editInsurance && (
          <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && closeEditInsurance()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-edit-insurance-title"
          >
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
              <div className="modal-dialog-header">
                <h3 id="modal-edit-insurance-title" className="modal-dialog-title">Update insurance</h3>
                <button type="button" className="modal-dialog-close" onClick={closeEditInsurance} aria-label="Close">×</button>
              </div>
              <div className="modal-dialog-body">
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="card" style={{ padding: '0.85rem' }}>
                    <div className="card-title">Third-party</div>
                    <div className="form-row">
                      <label>Provider</label>
                      <input type="text" value={insThirdPartyProvider} onChange={(e) => setInsThirdPartyProvider(e.target.value)} className="input" placeholder="Optional" maxLength={255} />
                    </div>
                    <div className="form-row">
                      <label>Policy number</label>
                      <input type="text" value={insThirdPartyNumber} onChange={(e) => setInsThirdPartyNumber(e.target.value)} className="input" placeholder="Optional" maxLength={64} />
                    </div>
                    <div className="form-row">
                      <label>Start date</label>
                      <input type="date" value={insThirdPartyStart} onChange={(e) => setInsThirdPartyStart(e.target.value)} className="input" />
                    </div>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>End date</label>
                      <input type="date" value={insThirdPartyEnd} onChange={(e) => setInsThirdPartyEnd(e.target.value)} className="input" />
                    </div>
                  </div>
                  <div className="card" style={{ padding: '0.85rem' }}>
                    <div className="card-title">Own damage</div>
                    <div className="form-row">
                      <label>Provider</label>
                      <input type="text" value={insOwnProvider} onChange={(e) => setInsOwnProvider(e.target.value)} className="input" placeholder="Optional" maxLength={255} />
                    </div>
                    <div className="form-row">
                      <label>Policy number</label>
                      <input type="text" value={insOwnNumber} onChange={(e) => setInsOwnNumber(e.target.value)} className="input" placeholder="Optional" maxLength={64} />
                    </div>
                    <div className="form-row">
                      <label>Start date</label>
                      <input type="date" value={insOwnStart} onChange={(e) => setInsOwnStart(e.target.value)} className="input" />
                    </div>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>End date</label>
                      <input type="date" value={insOwnEnd} onChange={(e) => setInsOwnEnd(e.target.value)} className="input" />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button type="button" className="btn btn-primary" onClick={handleSaveInsurance} disabled={savingInsurance}>
                    {savingInsurance ? 'Saving…' : 'Save insurance'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeEditInsurance}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                <div className="card-meta">Saving a real reading recalibrates the estimated odometer from now onward.</div>
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
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="input" rows={2} placeholder="Optional internal notes" />
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

        {activeSection === 'overview' && (
          <>
            {reminderItems.length > 0 && (
              <div className="vehicle-reminder-grid" style={{ marginTop: '1rem' }}>
                {reminderItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`vehicle-reminder-card vehicle-reminder-card--${item.severity}`}
                    onClick={() => openSection(item.section)}
                  >
                    <span className="vehicle-reminder-card__label">
                      {item.severity === 'overdue' ? 'Overdue' : item.severity === 'due' ? 'Due soon' : 'Reminder'}
                    </span>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="vehicle-summary card" style={{ marginTop: '1rem', maxWidth: '760px' }}>
              <div className="card-title">At a glance</div>
              <div className="dashboard-summary" style={{ marginTop: '0.5rem', gap: '0.75rem' }}>
                {avgFuelEconomy != null && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Average economy</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>
                      {formatFuelEconomy(avgFuelEconomy, preferences.distanceUnit, preferences.fuelVolumeUnit)}
                    </div>
                  </div>
                )}
                {lastFillEconomy != null && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Last fill economy</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>
                      {formatFuelEconomy(lastFillEconomy, preferences.distanceUnit, preferences.fuelVolumeUnit)}
                    </div>
                  </div>
                )}
                {lastFillDistance != null && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Last run</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{formatDistance(lastFillDistance, preferences.distanceUnit)}</div>
                  </div>
                )}
                {lastFuelRecord && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Latest fuel</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{formatFuelVolume(lastFuelRecord.fuelQuantity, preferences.fuelVolumeUnit)}</div>
                    <div className="card-meta">{formatDate(lastFuelRecord.date)}</div>
                  </div>
                )}
                {vehicle.currentOdometer != null && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Manual odometer</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>
                      {formatDistance(vehicle.currentOdometer, preferences.distanceUnit)}
                    </div>
                    <div className="card-meta">Trusted vehicle reading</div>
                  </div>
                )}
                {trackerOdometer != null && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Tracker odometer</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>
                      {formatDistance(trackerOdometer, preferences.distanceUnit)}
                    </div>
                    <div className="card-meta">
                      {trackerDelta ?? trackerOdometerLabel ?? 'Reported by linked tracker'}
                    </div>
                  </div>
                )}
                {vehicle.estimatedOdometerKm != null && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Estimated odometer</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>
                      {formatDistance(vehicle.estimatedOdometerKm, preferences.distanceUnit)}
                    </div>
                    <div className="card-meta">
                      {vehicle.estimatedOdometerCalibratedAt
                        ? `Calibrated ${formatDateTime(vehicle.estimatedOdometerCalibratedAt)}`
                        : 'Waiting for first manual calibration'}
                    </div>
                  </div>
                )}
                {filteredFuelRecords.length > 0 && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Fuel records</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{filteredFuelRecords.length}</div>
                    <div className="card-meta">
                      {totalFuelSpend > 0
                        ? new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency, maximumFractionDigits: 0 }).format(totalFuelSpend)
                        : formatFuelVolume(totalFuelVolume, preferences.fuelVolumeUnit)}
                    </div>
                  </div>
                )}
                {lastMaintenance && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Latest maintenance</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>{lastMaintenance.type}</div>
                    <div className="card-meta">{formatDate(lastMaintenance.date)}</div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
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
          </>
        )}
      </section>
      {/*
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">Third-party insurance</div>
            <div className="stats-bar" style={{ marginTop: '0.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
              <span><strong>Provider:</strong> {vehicle.thirdPartyInsuranceProvider ?? '—'}</span>
              <span><strong>Policy no:</strong> {vehicle.thirdPartyInsuranceNumber ?? '—'}</span>
              <span><strong>Start:</strong> {vehicle.thirdPartyInsuranceStart ? formatDate(vehicle.thirdPartyInsuranceStart) : '—'}</span>
              <span><strong>End:</strong> {vehicle.thirdPartyInsuranceEnd ? formatDate(vehicle.thirdPartyInsuranceEnd) : '—'}</span>
              <span><strong>Status:</strong> {(() => {
                const days = daysUntil(vehicle.thirdPartyInsuranceEnd);
                if (days == null) return 'Not set';
                if (days < 0) return 'Expired';
                if (days <= 30) return `Due in ${days} day${days === 1 ? '' : 's'}`;
                return 'Active';
              })()}</span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Own damage insurance</div>
            <div className="stats-bar" style={{ marginTop: '0.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
              <span><strong>Provider:</strong> {vehicle.ownInsuranceProvider ?? '—'}</span>
              <span><strong>Policy no:</strong> {vehicle.ownInsuranceNumber ?? '—'}</span>
              <span><strong>Start:</strong> {vehicle.ownInsuranceStart ? formatDate(vehicle.ownInsuranceStart) : '—'}</span>
              <span><strong>End:</strong> {vehicle.ownInsuranceEnd ? formatDate(vehicle.ownInsuranceEnd) : '—'}</span>
              <span><strong>Status:</strong> {(() => {
                const days = daysUntil(vehicle.ownInsuranceEnd);
                if (days == null) return 'Not set';
                if (days < 0) return 'Expired';
                if (days <= 30) return `Due in ${days} day${days === 1 ? '' : 's'}`;
                return 'Active';
              })()}</span>
            </div>
          </div>
        </div>
              <div className="card" style={{ marginTop: '0.75rem' }}>
                <div className="card-title">Insurance reference</div>
          <div className="stats-bar" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {vehicle.name && <span><strong>Vehicle:</strong> {vehicle.name}</span>}
            {vehicle.licensePlate && <span><strong>License:</strong> {vehicle.licensePlate}</span>}
            {vehicle.vin && <span><strong>VIN:</strong> {vehicle.vin}</span>}
            {(vehicle.make || vehicle.model || vehicle.year != null) && (
              <span><strong>Model:</strong> {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</span>
            )}
            {vehicle.currentOdometer != null && <span><strong>Odometer:</strong> {formatDistance(vehicle.currentOdometer, preferences.distanceUnit)}</span>}
            {linkedDevice && <span><strong>Linked tracker:</strong> {deviceLabel(linkedDevice)}</span>}
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => setEditInsurance(true)}>
            Update insurance
          </button>
        </div>
      
      */}

      {activeSection === 'fuel' && (
      <section className="page-section" id="fuel-history">
        <h3 className="page-heading">Fuel history</h3>
        <p className="page-subheading" style={{ marginBottom: '0.75rem' }}>
          Fastest day-to-day workflow for this vehicle. Add fills here and review economy, spend, and run distance.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAddFuelForm(true)}
          >
            Add fuel record
          </button>
          <label>
            Period{' '}
            <select className="input" value={fuelTimePreset} onChange={(e) => setFuelTimePreset(e.target.value as TimeFilterPreset)}>
              <option value="all">All</option>
              <option value="this_month">This month</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="this_year">This year</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          {fuelTimePreset === 'custom' && (
            <>
              <label>
                From{' '}
                <input type="date" className="input" value={fuelFromDate} onChange={(e) => setFuelFromDate(e.target.value)} />
              </label>
              <label>
                To{' '}
                <input type="date" className="input" value={fuelToDate} onChange={(e) => setFuelToDate(e.target.value)} />
              </label>
            </>
          )}
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
                  <label>Date & time</label>
                  <input
                    type="datetime-local"
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
        {filteredFuelRecords.length > 0 && (
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
              <span className="fuel-chart-legend">
                <span className="fuel-chart-legend-dot fuel-chart-legend-cost" /> Cost
                <span className="fuel-chart-legend-dot fuel-chart-legend-mileage" /> Economy
              </span>
            </div>
            <div className="fuel-chart-viz" style={{ height: chartHeight }}>
              <div className="fuel-chart-bars">
                {chartRecords.map((r) => {
                  const costH = Math.max(4, Math.round(((r.fuelCost ?? 0) / maxCost) * chartHeight));
                  const mileageVal = mileageByRecordId[r.id];
                  const runVal = distanceByRecordId[r.id];
                  const mileageH = mileageVal != null ? Math.max(4, Math.round((mileageVal / maxMileage) * chartHeight)) : 0;
                  const hasMileage = mileageVal != null;
                  return (
                    <div key={r.id} className="fuel-chart-col">
                      <div className="fuel-chart-value-stack">
                        <span className="fuel-chart-value fuel-chart-value--cost">
                          {new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency, maximumFractionDigits: 0 }).format(r.fuelCost ?? 0)}
                        </span>
                        <span className="fuel-chart-value fuel-chart-value--mileage">
                          {mileageVal != null ? formatFuelEconomy(mileageVal, preferences.distanceUnit, preferences.fuelVolumeUnit) : '—'}
                        </span>
                        <span className="fuel-chart-value fuel-chart-value--run">
                          {runVal != null ? `${formatDistance(runVal, preferences.distanceUnit)} run` : 'First fill'}
                        </span>
                      </div>
                      <div className="fuel-chart-track">
                        <div className={`fuel-chart-bar-group${hasMileage ? ' fuel-chart-bar-group--dual' : ''}`}>
                          <div className="fuel-chart-bar fuel-chart-bar--cost" style={{ height: costH }} />
                          {hasMileage && <div className="fuel-chart-bar fuel-chart-bar--mileage" style={{ height: mileageH }} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="fuel-chart-labels">
              {chartRecords.map((r) => {
                return (
                  <div key={r.id} className="fuel-chart-label">
                    <span className="fuel-chart-label-date">{formatChartDate(r.date)}</span>
                    <span className="fuel-chart-label-qty">{formatFuelVolume(r.fuelQuantity, preferences.fuelVolumeUnit)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {filteredFuelRecords.length === 0 && !showAddFuelForm ? (
          <p className="muted">No fuel records found for the selected time range.</p>
        ) : filteredFuelRecords.length === 0 ? null : (
          <div className="table-wrap table-wrap--scroll" style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Odometer</th>
                  <th>Km run</th>
                  <th>Quantity</th>
                  <th>Cost</th>
                  <th>Rate</th>
                  <th>Mileage</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...filteredFuelRecords]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, fuelRecordLimit >= 999 ? undefined : fuelRecordLimit)
                  .map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.date)}</td>
                    <td>{formatDistance(r.odometer, preferences.distanceUnit)}</td>
                    <td>
                      {distanceByRecordId[r.id] != null
                        ? formatDistance(distanceByRecordId[r.id], preferences.distanceUnit)
                        : '—'}
                    </td>
                    <td>{formatFuelVolume(r.fuelQuantity, preferences.fuelVolumeUnit)}</td>
                    <td>
                      {r.fuelCost != null
                        ? new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency }).format(r.fuelCost)
                        : '—'}
                    </td>
                    <td>{r.fuelRate != null ? r.fuelRate.toFixed(2) : '—'}</td>
                    <td>
                      {mileageByRecordId[r.id] != null
                        ? formatFuelEconomy(mileageByRecordId[r.id], preferences.distanceUnit, preferences.fuelVolumeUnit)
                        : '—'}
                    </td>
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
                      <label>Date & time</label>
                      <input
                        type="datetime-local"
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
      )}

      {false && (
        <section className="page-section">
          <h3 className="page-heading">Maintenance</h3>
          <p className="page-subheading" style={{ marginBottom: '0.75rem' }}>
            Service and repair history for this vehicle, with simple reminders based on recent records.
          </p>
          {maintenanceReminderItems.length > 0 && (
            <div className="vehicle-reminder-grid" style={{ marginBottom: '0.75rem' }}>
              {maintenanceReminderItems.map((item) => (
                <div key={item.id} className={`vehicle-reminder-card vehicle-reminder-card--${item.severity}`}>
                  <span className="vehicle-reminder-card__label">
                    {item.severity === 'overdue' ? 'Overdue' : item.severity === 'due' ? 'Due soon' : 'Reminder'}
                  </span>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
            </div>
          )}
          <div className="dashboard-summary" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="dashboard-stat">
              <div className="dashboard-stat-label">Records</div>
              <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{maintenanceRecords.length}</div>
            </div>
            <div className="dashboard-stat">
              <div className="dashboard-stat-label">Total spend</div>
              <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>
                {new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency, maximumFractionDigits: 0 }).format(maintenanceSpend)}
              </div>
            </div>
            {lastMaintenance && (
              <div className="dashboard-stat">
                <div className="dashboard-stat-label">Latest record</div>
                <div className="dashboard-stat-value" style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>{lastMaintenance.type}</div>
                <div className="card-meta">{formatDate(lastMaintenance.date)}</div>
              </div>
            )}
          </div>
          {maintenanceRecords.length === 0 ? (
            <div className="card">
              <div className="card-title">No maintenance records yet</div>
              <p className="muted">Start by adding your first service, inspection, or repair record.</p>
            </div>
          ) : (
            <div className="table-wrap table-wrap--scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Odometer</th>
                    <th>Notes</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceRecords.slice(0, 8).map((record) => (
                    <tr key={record.id}>
                      <td>{formatDateTime(record.date)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{record.type}</td>
                      <td>{record.odometer != null ? formatDistance(record.odometer, preferences.distanceUnit) : '—'}</td>
                      <td>{record.notes?.trim() || '—'}</td>
                      <td>
                        {record.cost != null
                          ? new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency }).format(record.cost)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <Link to={`/maintenance?vehicleId=${id}`} className="btn btn-secondary">Open maintenance workspace</Link>
            <button type="button" className="btn btn-secondary" onClick={() => openSection('overview')}>Back to overview</button>
          </div>
        </section>
      )}

      {/*
      <section className="page-section" id="insurance-section">
        <h3 className="page-heading">Insurance</h3>
        <p className="page-subheading" style={{ marginBottom: '0.75rem' }}>
          Policy details, vehicle identifiers, and renewal reminders in one place.
        </p>
        {insuranceExpiringReminders.length > 0 && (
          <div className="card" style={{ marginBottom: '0.75rem', borderLeft: '4px solid var(--color-warning, #e67700)', background: 'var(--bg-subtle, rgba(0,0,0,0.03))' }}>
            <div className="card-title">Renewal reminders</div>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
              {insuranceExpiringReminders.map((r) => (
                <li key={r.type}>
                  <strong>{r.type}</strong> expires on {formatDate(r.endDate)}.
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">Third-party insurance</div>
            <div className="stats-bar" style={{ marginTop: '0.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
              <span><strong>Provider:</strong> {vehicle.thirdPartyInsuranceProvider ?? '—'}</span>
              <span><strong>Policy no:</strong> {vehicle.thirdPartyInsuranceNumber ?? '—'}</span>
              <span><strong>Start:</strong> {vehicle.thirdPartyInsuranceStart ? formatDate(vehicle.thirdPartyInsuranceStart) : '—'}</span>
              <span><strong>End:</strong> {vehicle.thirdPartyInsuranceEnd ? formatDate(vehicle.thirdPartyInsuranceEnd) : '—'}</span>
              <span><strong>Status:</strong> {(() => {
                const days = daysUntil(vehicle.thirdPartyInsuranceEnd);
                if (days == null) return 'Not set';
                if (days < 0) return 'Expired';
                if (days <= 30) return `Due in ${days} day${days === 1 ? '' : 's'}`;
                return 'Active';
              })()}</span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Own damage insurance</div>
            <div className="stats-bar" style={{ marginTop: '0.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
              <span><strong>Provider:</strong> {vehicle.ownInsuranceProvider ?? '—'}</span>
              <span><strong>Policy no:</strong> {vehicle.ownInsuranceNumber ?? '—'}</span>
              <span><strong>Start:</strong> {vehicle.ownInsuranceStart ? formatDate(vehicle.ownInsuranceStart) : '—'}</span>
              <span><strong>End:</strong> {vehicle.ownInsuranceEnd ? formatDate(vehicle.ownInsuranceEnd) : '—'}</span>
              <span><strong>Status:</strong> {(() => {
                const days = daysUntil(vehicle.ownInsuranceEnd);
                if (days == null) return 'Not set';
                if (days < 0) return 'Expired';
                if (days <= 30) return `Due in ${days} day${days === 1 ? '' : 's'}`;
                return 'Active';
              })()}</span>
            </div>
          </div>
        </div>
        <div className="card" style={{ marginTop: '0.75rem' }}>
          <div className="card-title">Insurance reference</div>
          <div className="stats-bar" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {vehicle.name && <span><strong>Vehicle:</strong> {vehicle.name}</span>}
            {vehicle.licensePlate && <span><strong>License:</strong> {vehicle.licensePlate}</span>}
            {vehicle.vin && <span><strong>VIN:</strong> {vehicle.vin}</span>}
            {(vehicle.make || vehicle.model || vehicle.year != null) && (
              <span><strong>Model:</strong> {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</span>
            )}
            {vehicle.currentOdometer != null && <span><strong>Odometer:</strong> {formatDistance(vehicle.currentOdometer, preferences.distanceUnit)}</span>}
            {linkedDevice && <span><strong>Linked tracker:</strong> {deviceLabel(linkedDevice)}</span>}
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => setEditInsurance(true)}>
            Update insurance
          </button>
        </div>
      </section>
      */}
      {activeSection === 'records' && (
      <section className="page-section" id="records-section">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div className="card-title">Unified records</div>
              <div className="card-meta">Maintenance, insurance, documents, subscriptions, expenses, and accessories all live in one timeline.</div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowAddRecordForm(true);
                setRecordError(null);
              }}
            >
              Add record
            </button>
          </div>

          <div className="dashboard-summary" style={{ marginTop: '0.75rem', gap: '0.75rem' }}>
            <div className="dashboard-stat">
              <div className="dashboard-stat-label">All records</div>
              <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{filteredVehicleRecords.length}</div>
            </div>
            <div className="dashboard-stat">
              <div className="dashboard-stat-label">Maintenance</div>
              <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{maintenanceRecords.length}</div>
            </div>
            <div className="dashboard-stat">
              <div className="dashboard-stat-label">Documents</div>
              <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{filteredDocumentCount}</div>
            </div>
            <div className="dashboard-stat">
              <div className="dashboard-stat-label">Due soon</div>
              <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{filteredDueSoonCount}</div>
              <div className="card-meta">
                Based on selected scope and period
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <label>
              Scope{' '}
              <select className="input" value={recordScope} onChange={(e) => setRecordScope(e.target.value as RecordScope)}>
                <option value="document">Documents only</option>
                <option value="all">All records</option>
              </select>
            </label>
            <label>
              Period{' '}
              <select className="input" value={recordTimePreset} onChange={(e) => setRecordTimePreset(e.target.value as TimeFilterPreset)}>
                <option value="all">All</option>
                <option value="this_month">This month</option>
                <option value="last_30_days">Last 30 days</option>
                <option value="this_year">This year</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {recordTimePreset === 'custom' && (
              <>
                <label>
                  From{' '}
                  <input type="date" className="input" value={recordFromDate} onChange={(e) => setRecordFromDate(e.target.value)} />
                </label>
                <label>
                  To{' '}
                  <input type="date" className="input" value={recordToDate} onChange={(e) => setRecordToDate(e.target.value)} />
                </label>
              </>
            )}
          </div>

          {showAddRecordForm && (
            <div
              className="modal-overlay"
              onClick={(e) => e.target === e.currentTarget && closeAddRecordForm()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-add-record-title"
            >
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px' }}>
                <div className="modal-dialog-header">
                  <h3 id="modal-add-record-title" className="modal-dialog-title">
                    {editingVehicleRecord ? 'Edit vehicle record' : 'Add vehicle record'}
                  </h3>
                  <button type="button" className="modal-dialog-close" onClick={closeAddRecordForm} aria-label="Close">×</button>
                </div>
                <div className="modal-dialog-body">
                  <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="form-row">
                <label>Type</label>
                <select className="input" value={recordType} onChange={(e) => setRecordType(e.target.value as VehicleRecordType)}>
                  {RECORD_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Subtype</label>
                <select className="input" value={recordSubtype} onChange={(e) => setRecordSubtype(e.target.value as VehicleRecordSubtype)}>
                  {RECORD_SUBTYPE_OPTIONS.filter((option) => option.type === recordType).map((option) => (
                    <option key={`${option.type}-${option.value}-${option.label}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Title</label>
                <input className="input" value={recordTitle} onChange={(e) => setRecordTitle(e.target.value)} placeholder="Enter a clear record title" />
              </div>
              <div className="form-row">
                <label>Date</label>
                <input type="datetime-local" className="input" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Valid until</label>
                <input type="date" className="input" value={recordValidUntil} onChange={(e) => setRecordValidUntil(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Amount</label>
                <input type="number" step="0.01" min="0" className="input" value={recordAmount} onChange={(e) => setRecordAmount(e.target.value)} placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Odometer</label>
                <input type="number" min="0" className="input" value={recordOdometer} onChange={(e) => setRecordOdometer(e.target.value)} placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Provider</label>
                <input className="input" value={recordProvider} onChange={(e) => setRecordProvider(e.target.value)} placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Reference</label>
                <input className="input" value={recordReferenceNumber} onChange={(e) => setRecordReferenceNumber(e.target.value)} placeholder="Optional" />
              </div>
              <div className="form-row">
                <label>Reminder mode</label>
                <select className="input" value={recordReminderMode} onChange={(e) => setRecordReminderMode(e.target.value as VehicleRecordReminderMode)}>
                  <option value="none">No reminder</option>
                  <option value="on_date">On expiry/date</option>
                  <option value="recurring_date">Recurring by days</option>
                  <option value="recurring_odometer">Recurring by odometer</option>
                </select>
              </div>
              <div className="form-row">
                <label>Remind days before</label>
                <input type="number" min="0" className="input" value={recordReminderDaysBefore} onChange={(e) => setRecordReminderDaysBefore(e.target.value)} />
              </div>
              {recordReminderMode === 'recurring_date' && (
                <div className="form-row">
                  <label>Recurring days</label>
                  <input type="number" min="1" className="input" value={recordRecurringDays} onChange={(e) => setRecordRecurringDays(e.target.value)} />
                </div>
              )}
              {recordReminderMode === 'recurring_odometer' && (
                <div className="form-row">
                  <label>Recurring distance</label>
                  <input type="number" min="1" className="input" value={recordRecurringKm} onChange={(e) => setRecordRecurringKm(e.target.value)} />
                </div>
              )}
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <input className="input" value={recordNotes} onChange={(e) => setRecordNotes(e.target.value)} placeholder="Optional notes" />
              </div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label>Attachment</label>
                <input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,image/*,application/pdf" onChange={(e) => setRecordAttachmentFile(e.target.files?.[0] ?? null)} />
              </div>
              {recordError && <p className="form-error" style={{ gridColumn: '1 / -1', margin: 0 }}>{recordError}</p>}
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={handleSaveVehicleRecord} disabled={recordSubmitting}>
                  {recordSubmitting ? 'Saving...' : editingVehicleRecord ? 'Save changes' : 'Save record'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { resetRecordForm(); closeAddRecordForm(); }}>
                  Cancel
                </button>
              </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {filteredVehicleRecords.length === 0 ? (
            <p className="muted" style={{ marginTop: '0.75rem' }}>No records found for the selected filters.</p>
          ) : (
            <div className="table-wrap table-wrap--scroll" style={{ marginTop: '0.75rem' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Reminder</th>
                    <th>Amount</th>
                    <th>Attachment</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredVehicleRecords.map((record) => {
                    const dueSummary = computeRecordDueSummary(record, latestRecordedOdometer, preferences.distanceUnit);
                    return (
                      <tr key={record.id} onClick={() => openViewVehicleRecord(record)} style={{ cursor: 'pointer' }}>
                        <td>{formatDateTime(record.date)}</td>
                        <td>{record.type} · {recordSubtypeLabel(record.subtype)}</td>
                        <td>
                          <strong>{record.title}</strong>
                          {(record.provider || record.referenceNumber || record.odometer != null) && (
                            <div className="card-meta">
                              {[
                                record.provider,
                                record.referenceNumber,
                                record.odometer != null ? `Odo ${formatDistance(record.odometer, preferences.distanceUnit)}` : null,
                              ].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td>{dueSummary ? dueSummary.label : '—'}</td>
                        <td>
                          {record.amount != null
                            ? new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency }).format(record.amount)
                            : '—'}
                        </td>
                        <td>
                          {record.attachmentPath ? (
                            <button type="button" className="btn-link" onClick={(e) => { e.stopPropagation(); void handleViewVehicleRecordAttachment(record.id); }}>
                              View
                            </button>
                          ) : uploadingRecordAttachmentId === record.id ? 'Uploading...' : '—'}
                        </td>
                        <td>
                          <button type="button" className="btn-link" onClick={(e) => { e.stopPropagation(); openEditVehicleRecord(record); }}>
                            Edit
                          </button>
                          {' '}
                          <button
                            type="button"
                            className="btn-link danger"
                            onClick={(e) => { e.stopPropagation(); void handleDeleteVehicleRecord(record.id); }}
                            disabled={deletingRecordId === record.id}
                          >
                            {deletingRecordId === record.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      )}

      {viewingVehicleRecord && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setViewingVehicleRecord(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-view-record-title"
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="modal-dialog-header">
              <h3 id="modal-view-record-title" className="modal-dialog-title">{viewingVehicleRecord.title}</h3>
              <button type="button" className="modal-dialog-close" onClick={() => setViewingVehicleRecord(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-dialog-body">
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="form-row">
                  <label>Type</label>
                  <div>{viewingVehicleRecord.type} · {recordSubtypeLabel(viewingVehicleRecord.subtype)}</div>
                </div>
                <div className="form-row">
                  <label>Date</label>
                  <div>{formatDateTime(viewingVehicleRecord.date)}</div>
                </div>
                <div className="form-row">
                  <label>Reminder</label>
                  <div>{computeRecordDueSummary(viewingVehicleRecord, latestRecordedOdometer, preferences.distanceUnit)?.label ?? '—'}</div>
                </div>
                <div className="form-row">
                  <label>Amount</label>
                  <div>
                    {viewingVehicleRecord.amount != null
                      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: preferences.currency }).format(viewingVehicleRecord.amount)
                      : '—'}
                  </div>
                </div>
                <div className="form-row">
                  <label>Odometer</label>
                  <div>{viewingVehicleRecord.odometer != null ? formatDistance(viewingVehicleRecord.odometer, preferences.distanceUnit) : '—'}</div>
                </div>
                <div className="form-row">
                  <label>Valid until</label>
                  <div>{viewingVehicleRecord.validUntil ? formatDateTime(viewingVehicleRecord.validUntil) : '—'}</div>
                </div>
                <div className="form-row">
                  <label>Provider</label>
                  <div>{viewingVehicleRecord.provider || '—'}</div>
                </div>
                <div className="form-row">
                  <label>Reference</label>
                  <div>{viewingVehicleRecord.referenceNumber || '—'}</div>
                </div>
                <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                  <label>Notes</label>
                  <div>{viewingVehicleRecord.notes || '—'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={() => openEditVehicleRecord(viewingVehicleRecord)}>
                  Edit record
                </button>
                {viewingVehicleRecord.attachmentPath && (
                  <button type="button" className="btn btn-secondary" onClick={() => void handleViewVehicleRecordAttachment(viewingVehicleRecord.id)}>
                    View attachment
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setViewingVehicleRecord(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeSection === 'trips' && (
      <section className="page-section">
        <h3 className="page-heading">Trips</h3>
        <p className="page-subheading" style={{ marginBottom: '0.75rem' }}>
          Trips can come from linked-device activity, manual creation, or GPX import. View and filter by vehicle in the Trips menu.
        </p>
        <div>
          <Link to={`/trips?vehicleId=${encodeURIComponent(id!)}`} className="btn btn-secondary">
            View trips for this vehicle
          </Link>
        </div>
      </section>
      )}
    </div>
  );
}
