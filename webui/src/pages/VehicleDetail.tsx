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

type VehicleSection = 'overview' | 'fuel' | 'maintenance' | 'documents' | 'trips';

interface ReminderItem {
  id: string;
  title: string;
  detail: string;
  severity: 'overdue' | 'due' | 'info';
  section: VehicleSection;
}

function getVehicleSection(value: string | null): VehicleSection {
  if (value === 'fuel' || value === 'maintenance' || value === 'documents' || value === 'trips') {
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
 * Records sorted by date ascending; each fill uses odometer − previous odometer as distance.
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
  const [showInsuranceSection, setShowInsuranceSection] = useState(false);

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
    if (activeSection === 'documents') {
      setShowInsuranceSection(true);
    }
  }, [activeSection]);

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

  const avgFuelEconomy = useMemo(() => avgFuelEconomyKmPerL(fuelRecords), [fuelRecords]);
  const lastFillEconomy = useMemo(() => lastFillKmPerL(fuelRecords), [fuelRecords]);
  const distanceByRecordId = useMemo(() => {
    const sorted = [...fuelRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const map: Record<string, number> = {};
    for (let i = 1; i < sorted.length; i++) {
      const dist = sorted[i].odometer - sorted[i - 1].odometer;
      if (dist > 0) {
        map[sorted[i].id] = dist;
      }
    }
    return map;
  }, [fuelRecords]);
  const mileageByRecordId = useMemo(() => {
    const sorted = [...fuelRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const map: Record<string, number> = {};
    for (let i = 1; i < sorted.length; i++) {
      const dist = sorted[i].odometer - sorted[i - 1].odometer;
      if (dist > 0 && sorted[i].fuelQuantity > 0) {
        const kmPerL = dist / sorted[i].fuelQuantity;
        if (Number.isFinite(kmPerL) && kmPerL > 0) map[sorted[i].id] = kmPerL;
      }
    }
    return map;
  }, [fuelRecords]);
  const lastFillDistance = useMemo(() => {
    const sorted = [...fuelRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sorted.length < 2) return null;
    const dist = sorted[0].odometer - sorted[1].odometer;
    return dist > 0 ? dist : null;
  }, [fuelRecords]);
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
    () => [...fuelRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null,
    [fuelRecords],
  );
  const totalFuelSpend = useMemo(
    () => fuelRecords.reduce((sum, record) => sum + (record.fuelCost ?? 0), 0),
    [fuelRecords],
  );
  const totalFuelVolume = useMemo(
    () => fuelRecords.reduce((sum, record) => sum + record.fuelQuantity, 0),
    [fuelRecords],
  );
  const latestRecordedOdometer = lastFuelRecord?.odometer ?? vehicle?.currentOdometer ?? null;

  const insuranceExpiringReminders = useMemo(() => {
    if (!vehicle) return [];
    const now = new Date();
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const reminders: { type: string; endDate: string }[] = [];
    if (vehicle.thirdPartyInsuranceEnd) {
      const end = new Date(vehicle.thirdPartyInsuranceEnd);
      if (end >= now && end <= in30) {
        reminders.push({ type: 'Third-party insurance', endDate: vehicle.thirdPartyInsuranceEnd });
      }
    }
    if (vehicle.ownInsuranceEnd) {
      const end = new Date(vehicle.ownInsuranceEnd);
      if (end >= now && end <= in30) {
        reminders.push({ type: 'Own damage insurance', endDate: vehicle.ownInsuranceEnd });
      }
    }
    return reminders;
  }, [vehicle?.thirdPartyInsuranceEnd, vehicle?.ownInsuranceEnd]);
  const linkedDevice = useMemo(
    () => (vehicle?.deviceId ? devices.find((d) => d.id === vehicle.deviceId) ?? null : null),
    [vehicle?.deviceId, devices],
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
        section: 'maintenance',
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
        section: 'maintenance',
      });
    } else if (serviceDays >= 150) {
      items.push({
        id: 'maintenance-time',
        title: 'Service review due soon',
        detail: `Last service/inspection was ${serviceDays} days ago on ${formatDate(lastServiceRecord.date)}.`,
        severity: 'due',
        section: 'maintenance',
      });
    }

    if (serviceDistance != null && serviceDistance >= 5000) {
      items.push({
        id: 'maintenance-distance',
        title: 'Distance-based service overdue',
        detail: `${formatDistance(serviceDistance, preferences.distanceUnit)} since the last service record.`,
        severity: 'overdue',
        section: 'maintenance',
      });
    } else if (serviceDistance != null && serviceDistance >= 4000) {
      items.push({
        id: 'maintenance-distance',
        title: 'Distance-based service due soon',
        detail: `${formatDistance(serviceDistance, preferences.distanceUnit)} since the last service record.`,
        severity: 'due',
        section: 'maintenance',
      });
    }

    return items;
  }, [lastServiceRecord, latestRecordedOdometer, preferences.distanceUnit]);
  const insuranceReminderItems = useMemo<ReminderItem[]>(() => {
    if (!vehicle) return [];
    const items: ReminderItem[] = [];
    const candidates = [
      { id: 'insurance-third-party', label: 'Third-party insurance', endDate: vehicle.thirdPartyInsuranceEnd },
      { id: 'insurance-own', label: 'Own damage insurance', endDate: vehicle.ownInsuranceEnd },
    ];
    for (const candidate of candidates) {
      const days = daysUntil(candidate.endDate);
      if (days == null || days > 30) continue;
      items.push({
        id: candidate.id,
        title: candidate.label,
        detail: candidate.endDate
          ? `${formatDate(candidate.endDate)} · ${formatReminderDays(days)}`
          : 'Policy date not set',
        severity: days < 0 ? 'overdue' : 'due',
        section: 'documents',
      });
    }
    return items;
  }, [vehicle]);
  const reminderItems = useMemo(
    () => [...insuranceReminderItems, ...maintenanceReminderItems],
    [insuranceReminderItems, maintenanceReminderItems],
  );
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
        if (editDetails) closeEditDetails();
        if (editInsurance) closeEditInsurance();
        if (editingFuelRecord) closeEditFuelForm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAddFuelForm, editDetails, editInsurance, editingFuelRecord, closeAddFuelForm, closeEditDetails, closeEditInsurance, closeEditFuelForm]);

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
    const limit = fuelRecordLimit >= 999 ? fuelRecords.length : fuelRecordLimit;
    return fuelRecords.slice(0, limit).reverse();
  }, [fuelRecords, fuelRecordLimit]);
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
        <div className="vehicle-section-actions" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => { openSection('fuel'); setShowAddFuelForm(true); }}>
            Add fuel
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => openSection('maintenance')}>
            Maintenance
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => openSection('documents')}>
            Documents
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => openSection('trips')}>
            Trips
          </button>
        </div>

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
              {/*
                <span style={{ gridColumn: '1 / -1' }}>
                  <strong>Third-party insurance:</strong>{' '}
                  {vehicle.thirdPartyInsuranceProvider ?? '—'}
                  {vehicle.thirdPartyInsuranceNumber && ` · #${vehicle.thirdPartyInsuranceNumber}`}
                  {(vehicle.thirdPartyInsuranceStart || vehicle.thirdPartyInsuranceEnd) && ` · ${vehicle.thirdPartyInsuranceStart ? formatDate(vehicle.thirdPartyInsuranceStart) : '—'} – ${vehicle.thirdPartyInsuranceEnd ? formatDate(vehicle.thirdPartyInsuranceEnd) : '—'}`}
                </span>
              */}
              {/*
                <span style={{ gridColumn: '1 / -1' }}>
                  <strong>Own damage insurance:</strong>{' '}
                  {vehicle.ownInsuranceProvider ?? '—'}
                  {vehicle.ownInsuranceNumber && ` · #${vehicle.ownInsuranceNumber}`}
                  {(vehicle.ownInsuranceStart || vehicle.ownInsuranceEnd) && ` · ${vehicle.ownInsuranceStart ? formatDate(vehicle.ownInsuranceStart) : '—'} – ${vehicle.ownInsuranceEnd ? formatDate(vehicle.ownInsuranceEnd) : '—'}`}
                </span>
              */}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditDetails(true)}>
                Edit vehicle data
              </button>
              <button type="button" className="btn" onClick={() => openSection('fuel')}>
                Open fuel
              </button>
              <button type="button" className="btn" onClick={() => openSection('documents')}>
                Open documents
              </button>
            </div>
          </div>
        ) : null}

        {insuranceExpiringReminders.length > 0 && (
          <div className="card" style={{ marginTop: '0.75rem', maxWidth: '520px', borderLeft: '4px solid var(--color-warning, #e67700)', background: 'var(--bg-subtle, rgba(0,0,0,0.03))' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span aria-hidden>⚠️</span> Insurance expiring soon
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {insuranceExpiringReminders.map((r) => (
                <li key={r.type} style={{ marginBottom: '0.25rem' }}>
                  <strong>{r.type}</strong> expires on {formatDate(r.endDate)}.
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => setEditInsurance(true)}>
              Update insurance
            </button>
          </div>
        )}

        <div className="vehicle-section-tabs" style={{ marginTop: '1rem' }}>
          {([
            ['overview', 'Overview'],
            ['fuel', 'Fuel'],
            ['maintenance', 'Maintenance'],
            ['documents', 'Documents'],
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
                <button type="button" className="modal-dialog-close" onClick={closeEditInsurance} aria-label="Close">Ã—</button>
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
                    {savingInsurance ? 'Savingâ€¦' : 'Save insurance'}
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
                {fuelRecords.length > 0 && (
                  <div className="dashboard-stat" style={{ textDecoration: 'none' }}>
                    <div className="dashboard-stat-label">Fuel records</div>
                    <div className="dashboard-stat-value" style={{ fontSize: '1.1rem' }}>{fuelRecords.length}</div>
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
                <button type="button" className="btn btn-secondary" onClick={() => openSection('fuel')}>Open fuel</button>
                <button type="button" className="btn btn-secondary" onClick={() => openSection('maintenance')}>Open maintenance</button>
                <button type="button" className="btn btn-secondary" onClick={() => openSection('documents')}>Open documents</button>
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
        {fuelRecords.length === 0 && !showAddFuelForm ? (
          <p className="muted">No fuel records yet. Click &quot;Add fuel record&quot; to add one.</p>
        ) : fuelRecords.length === 0 ? null : (
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
                {fuelRecords.slice(0, fuelRecordLimit >= 999 ? undefined : fuelRecordLimit).map((r) => (
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

      {activeSection === 'maintenance' && (
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
      {activeSection === 'documents' && (
      <section className="page-section" id="insurance-section">
        <button
          type="button"
          className="card"
          onClick={() => setShowInsuranceSection((open) => !open)}
          aria-expanded={showInsuranceSection}
          style={{ width: '100%', textAlign: 'left', padding: '1rem', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h3 className="page-heading" style={{ margin: 0 }}>Insurance</h3>
              <div className="card-meta" style={{ marginTop: '0.25rem' }}>
                {insuranceExpiringReminders.length > 0
                  ? `${insuranceExpiringReminders.length} renewal reminder${insuranceExpiringReminders.length === 1 ? '' : 's'}`
                  : 'Policy details and renewal info'}
              </div>
            </div>
            <span className="card-meta">{showInsuranceSection ? 'Hide' : 'Show'}</span>
          </div>
        </button>
        {showInsuranceSection && (
          <>
            {insuranceExpiringReminders.length > 0 && (
              <div className="card" style={{ marginTop: '0.75rem', marginBottom: '0.75rem', borderLeft: '4px solid var(--color-warning, #e67700)', background: 'var(--bg-subtle, rgba(0,0,0,0.03))' }}>
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
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'start', marginTop: '0.75rem' }}>
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
                {latestRecordedOdometer != null && <span><strong>Latest recorded odometer:</strong> {formatDistance(latestRecordedOdometer, preferences.distanceUnit)}</span>}
                {linkedDevice && <span><strong>Linked tracker:</strong> {deviceLabel(linkedDevice)}</span>}
              </div>
              <button type="button" className="btn btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => setEditInsurance(true)}>
                Update insurance
              </button>
            </div>
          </>
        )}
      </section>
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
