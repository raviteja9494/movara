import { usePreferences } from '../settings/PreferencesContext';
import type { DistanceUnit, FuelVolumeUnit } from '../settings/preferences';

export function Settings() {
  const { preferences, setPreferences } = usePreferences();

  const setDistanceUnit = (distanceUnit: DistanceUnit) => {
    setPreferences((prev) => ({ ...prev, distanceUnit }));
  };

  const setFuelVolumeUnit = (fuelVolumeUnit: FuelVolumeUnit) => {
    setPreferences((prev) => ({ ...prev, fuelVolumeUnit }));
  };

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Settings</h2>
        <p className="page-subheading">Units and display preferences. Values are converted for display only; data is stored in metric (km, L).</p>

        <div className="card" style={{ maxWidth: '420px', marginTop: '1rem' }}>
          <div className="card-title">Units</div>
          <div className="form-row" style={{ marginTop: '0.75rem' }}>
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
