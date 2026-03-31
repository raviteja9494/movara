import { useEffect, useMemo, useState } from 'react';
import { DeviceCommandPanel } from '../components/DeviceCommandPanel';
import { fetchDevices, type Device } from '../api/devices';
import { getErrorMessage } from '../utils/getErrorMessage';

function protocolLabel(protocol: Device['protocol']): string {
  return protocol.toUpperCase();
}

export function Advanced() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDevices({ page: 1, limit: 100 })
      .then((response) => {
        setDevices(response.data);
        setSelectedDeviceId((current) => current || response.data[0]?.id || '');
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load devices')))
      .finally(() => setLoading(false));
  }, []);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  if (loading) {
    return <div className="page"><p className="muted">Loading...</p></div>;
  }

  if (error) {
    return <div className="page"><p className="form-error">{error}</p></div>;
  }

  return (
    <div className="page">
      <h2 className="page-heading">Advanced</h2>
      <p className="page-subheading">
        Advanced device settings and server-side commands. Available commands depend on the selected device protocol.
      </p>

      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div className="card-title" style={{ marginBottom: '0.8rem' }}>Target device</div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label htmlFor="advanced-device-select">Device</label>
          <select
            id="advanced-device-select"
            className="input"
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {(device.name?.trim() || device.imei)} [{protocolLabel(device.protocol)}]
              </option>
            ))}
          </select>
          {selectedDevice && (
            <p className="card-meta" style={{ marginTop: '0.35rem' }}>
              IMEI: {selectedDevice.imei} • Status: {selectedDevice.status} • Last seen: {selectedDevice.lastSeen ? new Date(selectedDevice.lastSeen).toLocaleString() : 'Never'}
            </p>
          )}
        </div>
      </div>

      <DeviceCommandPanel device={selectedDevice} />
    </div>
  );
}
