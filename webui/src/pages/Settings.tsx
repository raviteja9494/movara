import { useState, useEffect, useRef } from 'react';
import { usePreferences } from '../settings/PreferencesContext';
import type { DistanceUnit, FuelVolumeUnit, Currency } from '../settings/preferences';
import { getApiBaseUrl, setApiBaseUrl, getDefaultApiBaseUrl } from '../api/apiConfig';
import { exportDatabase, restoreBackupUpload, clearDatabase, clearTrips, fetchRuntimeSettings, updateRuntimeSettings, type RuntimeSettings } from '../api/system';
import { clearToken } from '../api/tokenStorage';

export function Settings() {
  const { preferences, setPreferences } = usePreferences();
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [apiUrlSaved, setApiUrlSaved] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearTripsTracking, setClearTripsTracking] = useState(false);
  const [clearingTrips, setClearingTrips] = useState(false);
  const [clearTripsError, setClearTripsError] = useState<string | null>(null);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [autoStopMinDurationMinutesInput, setAutoStopMinDurationMinutesInput] = useState('3');
  const [autoStopMoveThresholdMetersInput, setAutoStopMoveThresholdMetersInput] = useState('60');
  const [autoStopMinPointsInput, setAutoStopMinPointsInput] = useState('3');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setApiUrl(getApiBaseUrl());
  }, []);

  useEffect(() => {
    fetchRuntimeSettings()
      .then((res) => setRuntimeSettings(res.settings))
      .catch((err) => setRuntimeError(err instanceof Error ? err.message : 'Failed to load runtime settings'))
      .finally(() => setRuntimeLoading(false));
  }, []);

  useEffect(() => {
    if (!runtimeSettings) return;
    setAutoStopMinDurationMinutesInput(String(runtimeSettings.autoStopMinDurationMinutes));
    setAutoStopMoveThresholdMetersInput(String(runtimeSettings.autoStopMoveThresholdMeters));
    setAutoStopMinPointsInput(String(runtimeSettings.autoStopMinPoints));
  }, [runtimeSettings]);

  const setDistanceUnit = (distanceUnit: DistanceUnit) => {
    setPreferences((prev) => ({ ...prev, distanceUnit }));
  };

  const setFuelVolumeUnit = (fuelVolumeUnit: FuelVolumeUnit) => {
    setPreferences((prev) => ({ ...prev, fuelVolumeUnit }));
  };

  const setCurrency = (currency: Currency) => {
    setPreferences((prev) => ({ ...prev, currency }));
  };

  const handleSaveApiUrl = () => {
    const val = apiUrl.trim();
    if (!val || (!val.startsWith('http://') && !val.startsWith('https://'))) return;
    setApiBaseUrl(val);
    setApiUrlSaved(true);
    setTimeout(() => setApiUrlSaved(false), 2000);
  };

  const handleResetApiUrl = () => {
    setApiUrl(getDefaultApiBaseUrl());
    setApiBaseUrl('');
    setApiUrlSaved(true);
    setTimeout(() => setApiUrlSaved(false), 2000);
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportDatabase();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      await restoreBackupUpload(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
      clearToken();
      alert('Database restored. Reload the page and log in again.');
      window.location.reload();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleClearTrips = async () => {
    if (!window.confirm(clearTripsTracking
      ? 'Clear all trips and all tracking data (device positions)? Vehicles, maintenance, and fuel data will be kept.'
      : 'Clear all trips only? Tracking data, vehicles, maintenance, and fuel will be kept.')) return;
    setClearingTrips(true);
    setClearTripsError(null);
    try {
      await clearTrips({ includeTracking: clearTripsTracking });
      alert('Trips cleared. You can reload the page to see the update.');
      window.location.reload();
    } catch (err) {
      setClearTripsError(err instanceof Error ? err.message : 'Clear trips failed');
    } finally {
      setClearingTrips(false);
    }
  };

  const handleClear = async () => {
    if (clearConfirm !== 'CLEAR') return;
    setClearing(true);
    setClearError(null);
    try {
      await clearDatabase();
      setClearConfirm('');
      clearToken();
      alert('Database cleared. Reload the page.');
      window.location.reload();
    } catch (err) {
      setClearError(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setClearing(false);
    }
  };

  const handleProtocolLogLevelChange = async (protocolLogLevel: RuntimeSettings['protocolLogLevel']) => {
    setRuntimeSaving(true);
    setRuntimeError(null);
    try {
      const res = await updateRuntimeSettings({ protocolLogLevel });
      setRuntimeSettings(res.settings);
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Failed to update runtime settings');
    } finally {
      setRuntimeSaving(false);
    }
  };

  const handleAppLogLevelChange = async (appLogLevel: RuntimeSettings['appLogLevel']) => {
    setRuntimeSaving(true);
    setRuntimeError(null);
    try {
      const res = await updateRuntimeSettings({ appLogLevel });
      setRuntimeSettings(res.settings);
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Failed to update runtime settings');
    } finally {
      setRuntimeSaving(false);
    }
  };

  const handleAutoStopSettingsSave = async () => {
    const autoStopMinDurationMinutes = Number.parseInt(autoStopMinDurationMinutesInput, 10);
    const autoStopMoveThresholdMeters = Number.parseInt(autoStopMoveThresholdMetersInput, 10);
    const autoStopMinPoints = Number.parseInt(autoStopMinPointsInput, 10);

    if (
      !Number.isFinite(autoStopMinDurationMinutes) ||
      autoStopMinDurationMinutes < 1 ||
      !Number.isFinite(autoStopMoveThresholdMeters) ||
      autoStopMoveThresholdMeters < 5 ||
      !Number.isFinite(autoStopMinPoints) ||
      autoStopMinPoints < 2
    ) {
      setRuntimeError('Enter valid auto-stop values before saving.');
      return;
    }

    setRuntimeSaving(true);
    setRuntimeError(null);
    try {
      const res = await updateRuntimeSettings({
        autoStopMinDurationMinutes,
        autoStopMoveThresholdMeters,
        autoStopMinPoints,
      });
      setRuntimeSettings(res.settings);
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Failed to update runtime settings');
    } finally {
      setRuntimeSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Settings</h2>
        <p className="page-subheading">Units and display preferences. Values are converted for display only; data is stored in metric (km, L).</p>

        <div className="card settings-card">
          <div className="card-title">API server</div>
          <p className="card-meta" style={{ marginBottom: '0.75rem' }}>
            Base URL for the Movara API. Change this to use a different server (e.g. in the mobile app or when the API is on another host).
          </p>
          <div className="form-row">
            <label htmlFor="settings-api-url">Server URL</label>
            <input
              id="settings-api-url"
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={getDefaultApiBaseUrl()}
              className="input"
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.9rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={handleSaveApiUrl}>
                Save
              </button>
              <button type="button" className="btn" onClick={handleResetApiUrl}>
                Reset to default
              </button>
              {apiUrlSaved && <span className="muted" style={{ alignSelf: 'center' }}>Saved. Reload the page to ensure all requests use the new URL.</span>}
            </div>
          </div>
        </div>

        <div className="card settings-card">
          <div className="card-title">Units</div>
          <div className="form-row" style={{ marginTop: '1rem' }}>
            <label htmlFor="settings-distance">Distance</label>
            <select
              id="settings-distance"
              value={preferences.distanceUnit}
              onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)}
              className="input"
            >
              <option value="km">Kilometres (km)</option>
              <option value="mi">Miles (mi)</option>
            </select>
            <p className="card-meta" style={{ marginTop: '0.25rem' }}>
              Used for odometer, trip distance, speed and tracking.
            </p>
          </div>
          <div className="form-row" style={{ marginTop: '1rem' }}>
            <label htmlFor="settings-fuel">Fuel volume</label>
            <select
              id="settings-fuel"
              value={preferences.fuelVolumeUnit}
              onChange={(e) => setFuelVolumeUnit(e.target.value as FuelVolumeUnit)}
              className="input"
            >
              <option value="L">Litres (L)</option>
              <option value="gal">US gallons (gal)</option>
            </select>
            <p className="card-meta" style={{ marginTop: '0.25rem' }}>
              Used for fuel quantity in fuel logs. Economy shown as km/L or MPG accordingly.
            </p>
          </div>
          <div className="form-row" style={{ marginTop: '1rem' }}>
            <label htmlFor="settings-currency">Currency</label>
            <select
              id="settings-currency"
              value={preferences.currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="input"
            >
              <option value="INR">Indian Rupee (₹)</option>
              <option value="USD">US Dollar ($)</option>
              <option value="EUR">Euro (€)</option>
              <option value="GBP">British Pound (£)</option>
            </select>
            <p className="card-meta" style={{ marginTop: '0.25rem' }}>
              Used for maintenance costs and totals.
            </p>
          </div>
        </div>

        <div className="card settings-card">
          <div className="card-title">App logging</div>
          <p className="card-meta" style={{ marginBottom: '1rem' }}>
            Control app log verbosity. Default is no app logging so files do not grow quickly.
          </p>
          {runtimeError && <p className="form-error">{runtimeError}</p>}
          {runtimeLoading ? (
            <p className="muted">Loading runtime settings...</p>
          ) : (
            <div className="form-row">
              <label htmlFor="settings-app-log-level">App log level</label>
              <select
                id="settings-app-log-level"
                value={runtimeSettings?.appLogLevel ?? 'silent'}
                onChange={(e) => void handleAppLogLevelChange(e.target.value as RuntimeSettings['appLogLevel'])}
                className="input"
                disabled={runtimeSaving}
              >
                <option value="silent">No log</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
                <option value="trace">Trace</option>
              </select>
              <p className="card-meta" style={{ marginTop: '0.25rem' }}>
                Higher levels include more entries and will increase app log size.
              </p>
            </div>
          )}
        </div>

        <div className="card settings-card">
          <div className="card-title">Trip auto-stop detection</div>
          <p className="card-meta" style={{ marginBottom: '1rem' }}>
            Tune how trip pages detect and display automatic stops from tracked positions. This changes stop detection in the UI, not stored trips.
          </p>
          {runtimeError && <p className="form-error">{runtimeError}</p>}
          {runtimeLoading ? (
            <p className="muted">Loading runtime settings...</p>
          ) : (
            <>
              <div className="form-row">
                <label htmlFor="settings-auto-stop-duration">Minimum stop duration (minutes)</label>
                <input
                  id="settings-auto-stop-duration"
                  type="number"
                  min={1}
                  max={60}
                  value={autoStopMinDurationMinutesInput}
                  onChange={(e) => setAutoStopMinDurationMinutesInput(e.target.value)}
                  className="input"
                  disabled={runtimeSaving}
                />
              </div>
              <div className="form-row" style={{ marginTop: '1rem' }}>
                <label htmlFor="settings-auto-stop-distance">Movement threshold (meters)</label>
                <input
                  id="settings-auto-stop-distance"
                  type="number"
                  min={5}
                  max={1000}
                  value={autoStopMoveThresholdMetersInput}
                  onChange={(e) => setAutoStopMoveThresholdMetersInput(e.target.value)}
                  className="input"
                  disabled={runtimeSaving}
                />
              </div>
              <div className="form-row" style={{ marginTop: '1rem' }}>
                <label htmlFor="settings-auto-stop-points">Minimum clustered points</label>
                <input
                  id="settings-auto-stop-points"
                  type="number"
                  min={2}
                  max={20}
                  value={autoStopMinPointsInput}
                  onChange={(e) => setAutoStopMinPointsInput(e.target.value)}
                  className="input"
                  disabled={runtimeSaving}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={() => void handleAutoStopSettingsSave()} disabled={runtimeSaving}>
                  {runtimeSaving ? 'Saving...' : 'Save auto-stop settings'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="card settings-card">
          <div className="card-title">Tracker protocol logging</div>
          <p className="card-meta" style={{ marginBottom: '1rem' }}>
            Control protocol log verbosity at runtime. Choose no log to completely stop protocol log file writes.
          </p>
          {runtimeError && <p className="form-error">{runtimeError}</p>}
          {runtimeLoading ? (
            <p className="muted">Loading runtime settings…</p>
          ) : (
            <>
              <div className="form-row">
                <label htmlFor="settings-protocol-log-level">Protocol log level</label>
                <select
                  id="settings-protocol-log-level"
                  value={runtimeSettings?.protocolLogLevel ?? 'silent'}
                  onChange={(e) => void handleProtocolLogLevelChange(e.target.value as RuntimeSettings['protocolLogLevel'])}
                  className="input"
                  disabled={runtimeSaving}
                >
                  <option value="silent">No log</option>
                  <option value="error">Error</option>
                  <option value="warn">Warn</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                  <option value="trace">Trace</option>
                  <option value="raw">Raw only</option>
                </select>
                <p className="card-meta" style={{ marginTop: '0.25rem' }}>
                  `Raw only` keeps just timestamped inbound/outbound raw protocol traffic. `Trace` includes raw traffic plus parse and persistence details.
                </p>
              </div>
              <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
                Log directory: <code>{runtimeSettings?.protocolDebugDir ?? '--'}</code>
              </p>
            </>
          )}
        </div>

        <div className="card settings-card">
          <div className="card-title">Database</div>
          <p className="card-meta" style={{ marginBottom: '1rem' }}>
            Export a backup file, restore from a backup, or clear all data for a fresh start.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : 'Export database'}
            </button>
            <label className="btn" style={{ margin: 0, cursor: importing ? 'not-allowed' : 'pointer' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sql.gz,.gz"
                onChange={handleImport}
                disabled={importing}
                style={{ display: 'none' }}
              />
              {importing ? 'Importing…' : 'Import database'}
            </label>
            {exportError && <span className="muted" style={{ color: 'var(--color-error, #c00)' }}>{exportError}</span>}
            {importError && <span className="muted" style={{ color: 'var(--color-error, #c00)' }}>{importError}</span>}
          </div>
          <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Export downloads a <code>.sql.gz</code> file directly to your browser (e.g. Downloads), like Export GPX.
          </p>
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color, #eee)' }}>
            <p className="card-meta" style={{ marginBottom: '0.5rem' }}>
              Clear only trips (and optionally tracking). Vehicles, maintenance, and fuel data are kept.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={clearTripsTracking}
                onChange={(e) => setClearTripsTracking(e.target.checked)}
              />
              Also clear tracking (device positions and trip-merge data)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn"
                onClick={handleClearTrips}
                disabled={clearingTrips}
              >
                {clearingTrips ? 'Clearing…' : 'Clear trips'}
              </button>
              {clearTripsError && <span className="muted" style={{ color: 'var(--color-error, #c00)' }}>{clearTripsError}</span>}
            </div>
          </div>
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color, #eee)' }}>
            <p className="card-meta" style={{ marginBottom: '0.5rem' }}>
              Clear all data (vehicles, trips, fuel, maintenance, devices, users). This cannot be undone.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Type CLEAR to confirm"
                value={clearConfirm}
                onChange={(e) => setClearConfirm(e.target.value.toUpperCase())}
                className="input"
                style={{ width: '12rem' }}
              />
              <button
                type="button"
                className="btn"
                onClick={handleClear}
                disabled={clearing || clearConfirm !== 'CLEAR'}
                style={{ background: 'var(--color-error, #c00)', color: '#fff', border: 'none' }}
              >
                {clearing ? 'Clearing…' : 'Clear database'}
              </button>
              {clearError && <span className="muted" style={{ color: 'var(--color-error, #c00)' }}>{clearError}</span>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
