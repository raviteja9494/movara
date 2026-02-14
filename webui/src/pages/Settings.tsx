import { useState, useEffect } from 'react';
import { usePreferences } from '../settings/PreferencesContext';
import type { DistanceUnit, FuelVolumeUnit } from '../settings/preferences';
import { getApiBaseUrl, setApiBaseUrl, getDefaultApiBaseUrl } from '../api/apiConfig';

export function Settings() {
  const { preferences, setPreferences } = usePreferences();
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [apiUrlSaved, setApiUrlSaved] = useState(false);

  useEffect(() => {
    setApiUrl(getApiBaseUrl());
  }, []);

  const setDistanceUnit = (distanceUnit: DistanceUnit) => {
    setPreferences((prev) => ({ ...prev, distanceUnit }));
  };

  const setFuelVolumeUnit = (fuelVolumeUnit: FuelVolumeUnit) => {
    setPreferences((prev) => ({ ...prev, fuelVolumeUnit }));
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
              Used for fuel quantity in fuel logs. Economy shown as L/100 km or MPG accordingly.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
