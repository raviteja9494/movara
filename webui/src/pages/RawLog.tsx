import { useEffect, useState, useCallback } from 'react';
import { fetchRawLog, type RawLogEntry } from '../api/rawLog';
import { getErrorMessage } from '../utils/getErrorMessage';

const PORT_OPTIONS = [
  { value: '', label: 'All ports' },
  { value: '5051', label: '5051 (GT06)' },
  { value: '5055', label: '5055 (OsmAnd / Traccar Client)' },
];

export function RawLog() {
  const [entries, setEntries] = useState<RawLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portFilter, setPortFilter] = useState('');
  const [limit, setLimit] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(() => {
    setError(null);
    const port = portFilter ? parseInt(portFilter, 10) : undefined;
    fetchRawLog({ port, limit })
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load raw log')))
      .finally(() => setLoading(false));
  }, [portFilter, limit]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  return (
    <div className="page">
      <h2 className="page-heading">Raw log</h2>
      <p className="page-subheading">
        Live traffic received on protocol ports (GT06 5051, OsmAnd 5055). Buffer is in-memory only; data is lost on server restart. Max 500 entries.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
          <label>
            Port{' '}
            <select
              value={portFilter}
              onChange={(e) => setPortFilter(e.target.value)}
              className="input"
              style={{ marginLeft: '0.25rem' }}
            >
              {PORT_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>
            Limit{' '}
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="input"
              style={{ marginLeft: '0.25rem' }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => { setLoading(true); load(); }} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (3s)
          </label>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {!error && entries.length === 0 && !loading && (
        <p className="muted">No entries. Send data to port 5051 (GT06) or 5055 (OsmAnd/Traccar Client) to see it here.</p>
      )}

      {entries.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Port</th>
                <th>Remote</th>
                <th>Raw</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{e.at}</td>
                  <td>{e.port}</td>
                  <td style={{ fontSize: '0.85rem' }}>{e.remoteAddress ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', maxWidth: '60ch' }}>{e.raw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
