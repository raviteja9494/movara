import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePreferences } from '../settings/PreferencesContext';
import type { Currency, DistanceUnit, FuelVolumeUnit } from '../settings/preferences';
import { getApiBaseUrl, getDefaultApiBaseUrl, setApiBaseUrl } from '../api/apiConfig';
import {
  clearDatabase,
  clearTrips,
  exportDatabase,
  fetchRuntimeSettings,
  restoreBackupUpload,
  updateRuntimeSettings,
  type RuntimeSettings,
} from '../api/system';
import { clearToken } from '../api/tokenStorage';

function SettingsSection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="card settings-card settings-collapsible" open={defaultOpen}>
      <summary className="settings-collapsible-summary">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-meta">{description}</div>
        </div>
        <span className="settings-collapsible-icon" aria-hidden="true">▾</span>
      </summary>
      <div className="settings-collapsible-body">{children}</div>
    </details>
  );
}

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
  const [homeAssistantEnabled, setHomeAssistantEnabled] = useState(false);
  const [homeAssistantUrlInput, setHomeAssistantUrlInput] = useState('');
  const [homeAssistantTokenInput, setHomeAssistantTokenInput] = useState('');
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
    setHomeAssistantEnabled(runtimeSettings.homeAssistantEnabled);
    setHomeAssistantUrlInput(runtimeSettings.homeAssistantUrl ?? '');
    setHomeAssistantTokenInput(runtimeSettings.homeAssistantToken ?? '');
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
    const value = apiUrl.trim();
    if (!value || (!value.startsWith('http://') && !value.startsWith('https://'))) return;
    setApiBaseUrl(value);
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
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
    const confirmed = window.confirm(
      clearTripsTracking
        ? 'Clear all trips and all tracking data (device positions)? Vehicles, maintenance, and fuel data will be kept.'
        : 'Clear all trips only? Tracking data, vehicles, maintenance, and fuel will be kept.',
    );
    if (!confirmed) return;

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

  const saveRuntimeSettings = async (payload: Partial<RuntimeSettings>, fallbackMessage: string) => {
    setRuntimeSaving(true);
    setRuntimeError(null);
    try {
      const res = await updateRuntimeSettings(payload);
      setRuntimeSettings(res.settings);
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : fallbackMessage);
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

    await saveRuntimeSettings(
      { autoStopMinDurationMinutes, autoStopMoveThresholdMeters, autoStopMinPoints },
      'Failed to update runtime settings',
    );
  };

  const handleHomeAssistantSettingsSave = async () => {
    const trimmedUrl = homeAssistantUrlInput.trim().replace(/\/$/, '');
    const trimmedToken = homeAssistantTokenInput.trim();

    if (homeAssistantEnabled && (!trimmedUrl || !trimmedToken)) {
      setRuntimeError('Enter both the Home Assistant URL and access token before enabling the integration.');
      return;
    }
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setRuntimeError('Home Assistant URL must start with http:// or https://');
      return;
    }

    await saveRuntimeSettings(
      {
        homeAssistantEnabled,
        homeAssistantUrl: trimmedUrl,
        homeAssistantToken: trimmedToken,
      },
      'Failed to update Home Assistant settings',
    );
  };

  const renderRuntimeBlock = (content: ReactNode) => {
    if (runtimeLoading) return <p className="muted">Loading runtime settings...</p>;
    return content;
  };

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Settings</h2>
        <p className="page-subheading">Units, runtime controls, integrations, and maintenance tools.</p>
        {runtimeError && <p className="form-error">{runtimeError}</p>}

        <SettingsSection
          title="General"
          description="API endpoint and unit preferences."
          defaultOpen
        >
          <div className="form-row">
            <div className="card-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>API server</div>
            <p className="card-meta" style={{ marginBottom: '0.75rem' }}>
              Base URL for the Movara API. Change this if your frontend should talk to a different backend host.
            </p>
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

          <div className="settings-divider">
            <div className="card-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>Units</div>
            <div className="form-row">
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
                <option value="INR">Indian Rupee (Rs)</option>
                <option value="USD">US Dollar ($)</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="GBP">British Pound (GBP)</option>
              </select>
              <p className="card-meta" style={{ marginTop: '0.25rem' }}>
                Used for maintenance costs and totals.
              </p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Logging"
          description="App and tracker logger controls kept together."
        >
          {renderRuntimeBlock(
            <>
              <div className="form-row">
                <div className="card-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>App logging</div>
                <p className="card-meta" style={{ marginBottom: '0.75rem' }}>
                  Control app log verbosity. Higher levels grow log files more quickly.
                </p>
                <label htmlFor="settings-app-log-level">App log level</label>
                <select
                  id="settings-app-log-level"
                  value={runtimeSettings?.appLogLevel ?? 'silent'}
                  onChange={(e) => void saveRuntimeSettings({ appLogLevel: e.target.value as RuntimeSettings['appLogLevel'] }, 'Failed to update runtime settings')}
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
              </div>

              <div className="settings-divider">
                <div className="form-row">
                  <div className="card-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>Tracker protocol logging</div>
                  <p className="card-meta" style={{ marginBottom: '0.75rem' }}>
                    Control protocol log verbosity at runtime. Choose no log to stop protocol log file writes.
                  </p>
                  <label htmlFor="settings-protocol-log-level">Protocol log level</label>
                  <select
                    id="settings-protocol-log-level"
                    value={runtimeSettings?.protocolLogLevel ?? 'silent'}
                    onChange={(e) => void saveRuntimeSettings({ protocolLogLevel: e.target.value as RuntimeSettings['protocolLogLevel'] }, 'Failed to update runtime settings')}
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
                    `Raw only` keeps timestamped inbound and outbound raw traffic. `Trace` includes raw traffic plus parse and persistence details.
                  </p>
                  <p className="muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                    Log directory: <code>{runtimeSettings?.protocolDebugDir ?? '--'}</code>
                  </p>
                </div>
              </div>
            </>,
          )}
        </SettingsSection>

        <SettingsSection
          title="Trip Detection"
          description="Tune how automatic stop detection is shown in the trip UI."
        >
          {renderRuntimeBlock(
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
            </>,
          )}
        </SettingsSection>

        <SettingsSection
          title="Home Assistant"
          description="Optional REST push bridge for live tracker state mirroring."
        >
          {renderRuntimeBlock(
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={homeAssistantEnabled}
                  onChange={(e) => setHomeAssistantEnabled(e.target.checked)}
                  disabled={runtimeSaving}
                />
                Enable Home Assistant REST push
              </label>
              <div className="form-row">
                <label htmlFor="settings-ha-url">Home Assistant URL</label>
                <input
                  id="settings-ha-url"
                  type="url"
                  value={homeAssistantUrlInput}
                  onChange={(e) => setHomeAssistantUrlInput(e.target.value)}
                  placeholder="http://homeassistant.local:8123"
                  className="input"
                  disabled={runtimeSaving}
                />
              </div>
              <div className="form-row" style={{ marginTop: '1rem' }}>
                <label htmlFor="settings-ha-token">Long-lived access token</label>
                <input
                  id="settings-ha-token"
                  type="password"
                  value={homeAssistantTokenInput}
                  onChange={(e) => setHomeAssistantTokenInput(e.target.value)}
                  placeholder="Paste a Home Assistant token"
                  className="input"
                  disabled={runtimeSaving}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={() => void handleHomeAssistantSettingsSave()} disabled={runtimeSaving}>
                  {runtimeSaving ? 'Saving...' : 'Save Home Assistant settings'}
                </button>
              </div>
            </>,
          )}
        </SettingsSection>

        <SettingsSection
          title="Database"
          description="Back up, restore, or clear trip and app data."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export database'}
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
              {importing ? 'Importing...' : 'Import database'}
            </label>
            {exportError && <span className="muted" style={{ color: 'var(--color-error, #c00)' }}>{exportError}</span>}
            {importError && <span className="muted" style={{ color: 'var(--color-error, #c00)' }}>{importError}</span>}
          </div>
          <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Export downloads a <code>.sql.gz</code> file directly to your browser.
          </p>

          <div className="settings-divider">
            <p className="card-meta" style={{ marginBottom: '0.5rem' }}>
              Clear only trips and optionally tracking. Vehicles, maintenance, and fuel data are kept.
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
              <button type="button" className="btn" onClick={handleClearTrips} disabled={clearingTrips}>
                {clearingTrips ? 'Clearing...' : 'Clear trips'}
              </button>
              {clearTripsError && <span className="muted" style={{ color: 'var(--color-error, #c00)' }}>{clearTripsError}</span>}
            </div>
          </div>

          <div className="settings-divider">
            <p className="card-meta" style={{ marginBottom: '0.5rem' }}>
              Clear all data. This cannot be undone.
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
                {clearing ? 'Clearing...' : 'Clear database'}
              </button>
              {clearError && <span className="muted" style={{ color: 'var(--color-error, #c00)' }}>{clearError}</span>}
            </div>
          </div>
        </SettingsSection>
      </section>
    </div>
  );
}
