import { useEffect, useState } from 'react';
import {
  fetchVehicles,
  createVehicle,
  type Vehicle,
  type CreateVehiclePayload,
} from '../api/vehicles';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const loadVehicles = async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetchVehicles({ page: 1, limit: 100 });
      setVehicles(res.data);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateVehiclePayload = {
      name: name.trim(),
      description: description.trim() || null,
    };
    if (!payload.name) {
      setSubmitError('Name is required');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      await createVehicle(payload);
      setName('');
      setDescription('');
      await loadVehicles();
    } catch (err) {
      const error = err as Error & { fields?: Record<string, string[]> };
      if (error.fields && typeof error.fields === 'object') {
        setFieldErrors(error.fields);
        setSubmitError(error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : 'Failed to add vehicle');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Add vehicle</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <label htmlFor="vehicle-name">Name</label>
            <input
              id="vehicle-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIN or plate"
              className={fieldErrors.name ? 'input-invalid' : ''}
              maxLength={255}
              disabled={submitting}
            />
            {fieldErrors.name?.length ? (
              <span className="form-error">{fieldErrors.name.join(', ')}</span>
            ) : null}
          </div>
          <div className="form-row">
            <label htmlFor="vehicle-description">Description (optional)</label>
            <input
              id="vehicle-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
              className={fieldErrors.description ? 'input-invalid' : ''}
              maxLength={1000}
              disabled={submitting}
            />
            {fieldErrors.description?.length ? (
              <span className="form-error">{fieldErrors.description.join(', ')}</span>
            ) : null}
          </div>
          {submitError && !fieldErrors.name?.length && !fieldErrors.description?.length ? (
            <p className="form-error">{submitError}</p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add vehicle'}
          </button>
        </form>
      </section>

      <section className="page-section">
        <h2 className="page-heading">Vehicles</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : listError ? (
          <p className="form-error">{listError}</p>
        ) : vehicles.length === 0 ? (
          <p className="muted">No vehicles yet. Add one above.</p>
        ) : (
          <ul className="list">
            {vehicles.map((v) => (
              <li key={v.id} className="list-item">
                <div className="list-item-main">
                  <strong>{v.name}</strong>
                  {v.description ? <span className="muted"> — {v.description}</span> : null}
                </div>
                <div className="list-item-meta">{formatDate(v.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
