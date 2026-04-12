import { useEffect, useState } from 'react';
import {
  createSavedLocation,
  deleteSavedLocation,
  fetchSavedLocations,
  updateSavedLocation,
  type SavedLocation,
} from '../api/locations';
import { TrackMap } from '../components/TrackMap';
import { getErrorMessage } from '../utils/getErrorMessage';

function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function sortLocations(items: SavedLocation[]): SavedLocation[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export function Locations() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [notes, setNotes] = useState('');
  const [mapCreateMode, setMapCreateMode] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSavedLocations();
      setLocations(sortLocations(response.locations));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load saved locations'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setLatitude('');
    setLongitude('');
    setNotes('');
  };

  const closeModal = () => {
    setLocationModalOpen(false);
    setMapCreateMode(false);
    resetForm();
  };

  const openAddModal = (coords?: { lat: number; lon: number }) => {
    setEditingId(null);
    setName('');
    setLatitude(coords ? coords.lat.toFixed(6) : '');
    setLongitude(coords ? coords.lon.toFixed(6) : '');
    setNotes('');
    setLocationModalOpen(true);
  };

  const startEdit = (location: SavedLocation) => {
    setEditingId(location.id);
    setName(location.name);
    setLatitude(String(location.latitude));
    setLongitude(String(location.longitude));
    setNotes(location.notes ?? '');
    setLocationModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        notes: notes.trim() || null,
      };
      if (editingId) {
        const response = await updateSavedLocation(editingId, payload);
        setLocations((current) => sortLocations(current.map((item) => (item.id === editingId ? response.location : item))));
      } else {
        const response = await createSavedLocation(payload);
        setLocations((current) => sortLocations([...current, response.location]));
      }
      closeModal();
    } catch (err) {
      setError(getErrorMessage(err, editingId ? 'Failed to update location' : 'Failed to create location'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (location: SavedLocation) => {
    if (!window.confirm(`Delete saved location "${location.name}"?`)) return;
    setError(null);
    try {
      await deleteSavedLocation(location.id);
      setLocations((current) => current.filter((item) => item.id !== location.id));
      if (editingId === location.id) closeModal();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete location'));
    }
  };

  const handleCreateFromMap = (lat: number, lon: number) => {
    openAddModal({ lat, lon });
  };

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Locations</h2>
        <p className="page-subheading">Save places like home, office, parking spots, or service centers for quick reference.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <div className="device-list-header" style={{ marginBottom: '0.75rem' }}>
            <div>
              <div className="card-title">Map bookmarks</div>
              <div className="card-meta">Create bookmarks by clicking the map and review all saved places in one layer.</div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => openAddModal()}>
                Add location
              </button>
              <button type="button" className="btn-link" onClick={() => setMapCreateMode((current) => !current)}>
                {mapCreateMode ? 'Cancel map create mode' : 'Create from map'}
              </button>
            </div>
          </div>
          {mapCreateMode && <p className="card-meta" style={{ marginTop: 0 }}>Click or tap the map to open the location popup with those coordinates.</p>}
          <TrackMap
            positions={[]}
            bookmarks={locations.map((location) => ({
              lat: location.latitude,
              lon: location.longitude,
              label: location.name,
              notes: location.notes ?? undefined,
            }))}
            showRoute={false}
            onMapClick={mapCreateMode ? (lat, lon) => handleCreateFromMap(lat, lon) : undefined}
            height="320px"
          />
        </div>

        {loading ? (
          <p className="muted">Loading...</p>
        ) : locations.length === 0 ? (
          <p className="muted">No saved locations yet.</p>
        ) : (
          <ul className="list">
            {locations.map((location) => (
              <li key={location.id} className="list-item">
                <div className="list-item-main">
                  <div className="device-list-header">
                    <div>
                      <strong>{location.name}</strong>
                      <div className="muted">{formatCoords(location.latitude, location.longitude)}</div>
                    </div>
                    <div className="device-list-actions">
                      <button type="button" className="btn-link" onClick={() => startEdit(location)}>Edit</button>
                      <button type="button" className="btn-link danger" onClick={() => void handleDelete(location)}>Delete</button>
                    </div>
                  </div>
                  {location.notes && <div className="card-meta" style={{ marginTop: '0.4rem' }}>{location.notes}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {locationModalOpen && (
        <div
          className="modal-overlay"
          onClick={(event) => event.target === event.currentTarget && closeModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="saved-location-title"
        >
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-dialog-header">
              <h3 id="saved-location-title" className="modal-dialog-title">
                {editingId ? 'Edit location' : 'Add location'}
              </h3>
              <button type="button" className="modal-dialog-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-dialog-body">
              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <label className="form-row">
                    <span>Name</span>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Home" required />
                  </label>
                  <label className="form-row">
                    <span>Latitude</span>
                    <input className="input" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="12.97160" required />
                  </label>
                  <label className="form-row">
                    <span>Longitude</span>
                    <input className="input" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="77.59460" required />
                  </label>
                  <label className="form-row">
                    <span>Notes</span>
                    <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? (editingId ? 'Saving...' : 'Adding...') : editingId ? 'Save location' : 'Add location'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
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
