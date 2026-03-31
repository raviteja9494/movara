import { useEffect, useMemo, useState } from 'react';
import {
  fetchAvailableDeviceCommands,
  fetchDeviceCommandHistory,
  sendDeviceCommand,
  type DeviceCommandDefinition,
  type DeviceCommandRecord,
} from '../api/deviceCommands';
import type { Device } from '../api/devices';
import { getErrorMessage } from '../utils/getErrorMessage';

function formatCommandTime(iso: string | null): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleString();
}

function categoryLabel(category: DeviceCommandDefinition['category']): string {
  switch (category) {
    case 'setup':
      return 'Setup';
    case 'control':
      return 'Control';
    case 'query':
      return 'Query';
    case 'obd':
      return 'OBD';
    case 'custom':
      return 'Custom';
    default:
      return category;
  }
}

interface DeviceCommandPanelProps {
  device: Device | null;
}

export function DeviceCommandPanel({ device }: DeviceCommandPanelProps) {
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [supportsCommands, setSupportsCommands] = useState(false);
  const [commandConnected, setCommandConnected] = useState(false);
  const [commands, setCommands] = useState<DeviceCommandDefinition[]>([]);
  const [history, setHistory] = useState<DeviceCommandRecord[]>([]);
  const [selectedCommandKey, setSelectedCommandKey] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!device) {
      setCommands([]);
      setHistory([]);
      setSelectedCommandKey('');
      setSupportsCommands(false);
      setCommandConnected(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchAvailableDeviceCommands(device.id)
      .then((response) => {
        setSupportsCommands(response.supportsCommands);
        setCommandConnected(response.commandConnected);
        setCommands(response.commands);
        setSelectedCommandKey((current) => {
          if (current && response.commands.some((command) => command.key === current)) return current;
          return response.commands[0]?.key ?? '';
        });
      })
      .catch((err) => {
        setSupportsCommands(false);
        setCommandConnected(false);
        setCommands([]);
        setSelectedCommandKey('');
        setError(getErrorMessage(err, 'Failed to load command catalog'));
      })
      .finally(() => setLoading(false));
  }, [device?.id]);

  useEffect(() => {
    if (!device) return;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchDeviceCommandHistory(device.id)
      .then((response) => setHistory(response.commands))
      .catch((err) => setHistoryError(getErrorMessage(err, 'Failed to load command history')))
      .finally(() => setHistoryLoading(false));
  }, [device?.id]);

  useEffect(() => {
    if (!device) return;
    const interval = window.setInterval(() => {
      fetchAvailableDeviceCommands(device.id)
        .then((response) => setCommandConnected(response.commandConnected))
        .catch(() => {});
      fetchDeviceCommandHistory(device.id)
        .then((response) => setHistory(response.commands))
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(interval);
  }, [device?.id]);

  useEffect(() => {
    setValues({});
    setSendError(null);
  }, [selectedCommandKey, device?.id]);

  const selectedCommand = useMemo(
    () => commands.find((command) => command.key === selectedCommandKey) ?? null,
    [commands, selectedCommandKey],
  );

  if (!device) {
    return <p className="muted">Select a device to send commands.</p>;
  }

  const handleSend = async () => {
    if (!selectedCommand) return;
    setSending(true);
    setSendError(null);
    try {
      const response = await sendDeviceCommand(device.id, selectedCommand.key, values);
      setHistory((previous) => [response.command, ...previous.filter((item) => item.id !== response.command.id)].slice(0, 30));
      if (response.command.status === 'failed') {
        setSendError(response.command.error ?? 'Command failed');
      }
    } catch (err) {
      setSendError(getErrorMessage(err, 'Failed to send command'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div className="card-title" style={{ marginBottom: '0.35rem' }}>Device commands</div>
      <p className="card-meta" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
        Device protocol: <strong>{device.protocol.toUpperCase()}</strong>. Responses from supported trackers will appear in recent history below.
      </p>
      {supportsCommands && (
        <p className={`card-meta`} style={{ marginTop: '-0.35rem', marginBottom: '0.9rem' }}>
          Command link: <strong>{commandConnected ? 'Connected' : 'Not connected'}</strong>
        </p>
      )}

      {loading ? <p className="muted">Loading command catalog...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {!loading && !error && !supportsCommands ? (
        <p className="muted" style={{ marginBottom: '1rem' }}>
          This protocol does not have verified server-side commands implemented in Movara yet.
        </p>
      ) : null}

      {!loading && !error && supportsCommands && selectedCommand && (
        <>
          <div className="form-row">
            <label htmlFor={`command-${device.id}`}>Command</label>
            <select
              id={`command-${device.id}`}
              className="input"
              value={selectedCommandKey}
              onChange={(event) => setSelectedCommandKey(event.target.value)}
            >
              {commands.map((command) => (
                <option key={command.key} value={command.key}>
                  {categoryLabel(command.category)} - {command.label}
                </option>
              ))}
            </select>
            <p className="card-meta" style={{ marginTop: '0.25rem' }}>{selectedCommand.description}</p>
          </div>

          {selectedCommand.fields.length > 0 && (
            <div className="form-grid" style={{ marginTop: '0.75rem' }}>
              {selectedCommand.fields.map((field) => (
                <div key={field.key} className="form-row">
                  <label htmlFor={`${device.id}-${field.key}`}>{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      id={`${device.id}-${field.key}`}
                      className="input"
                      rows={3}
                      value={values[field.key] ?? ''}
                      placeholder={field.placeholder}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      id={`${device.id}-${field.key}`}
                      className="input"
                      value={values[field.key] ?? ''}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    >
                      <option value="">Select...</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`${device.id}-${field.key}`}
                      className="input"
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={values[field.key] ?? ''}
                      placeholder={field.placeholder}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                  )}
                  {field.helpText ? <p className="card-meta" style={{ marginTop: '0.25rem' }}>{field.helpText}</p> : null}
                </div>
              ))}
            </div>
          )}

          {sendError ? <p className="form-error" style={{ marginTop: '0.75rem' }}>{sendError}</p> : null}
          {!commandConnected ? (
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              There is no active live connection right now, so Movara will queue the command and push it on the next tracker connect/login.
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => void handleSend()} disabled={sending}>
              {sending ? 'Sending...' : commandConnected ? 'Send command' : 'Queue command'}
            </button>
            {selectedCommand.category === 'control' && (
              <span className="muted" style={{ alignSelf: 'center' }}>
                Control commands affect the live device immediately when connected.
              </span>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: '1rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
        <div className="card-title" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Recent commands</div>
        {historyLoading ? <p className="muted">Loading history...</p> : null}
        {historyError ? <p className="form-error">{historyError}</p> : null}
        {!historyLoading && history.length === 0 ? <p className="muted">No commands sent for this device yet.</p> : null}
        {history.length > 0 && (
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {history.map((entry) => (
              <div key={entry.id} style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.85rem', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <strong>{entry.commandLabel}</strong>
                  <span className={`device-summary-tag${entry.status === 'failed' ? ' is-offline' : ' is-online'}`}>{entry.status}</span>
                </div>
                <p className="card-meta" style={{ margin: '0.35rem 0 0.35rem' }}>{entry.content}</p>
                <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                  {entry.respondedAt
                    ? `Responded ${formatCommandTime(entry.respondedAt)}`
                    : entry.sentAt
                      ? `Sent ${formatCommandTime(entry.sentAt)}`
                      : entry.status === 'pending'
                        ? `Queued ${formatCommandTime(entry.createdAt)}`
                      : `Created ${formatCommandTime(entry.createdAt)}`}
                </p>
                {entry.response ? (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div className="device-detail-label" style={{ marginBottom: '0.2rem' }}>Response</div>
                    <pre
                      style={{
                        margin: 0,
                        padding: '0.65rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        background: 'var(--bg, #f7f7f7)',
                        borderRadius: '0.65rem',
                        fontSize: '0.78rem',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      }}
                    >
                      {entry.response}
                    </pre>
                  </div>
                ) : null}
                {entry.error ? <p className="form-error" style={{ marginTop: '0.4rem' }}>{entry.error}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
