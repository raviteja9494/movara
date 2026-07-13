import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';

interface ConnectionRegistration {
  protocol: TrackingProtocol;
  connectionKey: string;
  send: (payload: Buffer, deviceId: string) => Promise<void> | void;
}

export class LiveDeviceConnectionRegistry {
  private connections = new Map<string, ConnectionRegistration>();
  private deviceToConnection = new Map<string, string>();

  registerConnection(protocol: TrackingProtocol, connectionKey: string, send: (payload: Buffer, deviceId: string) => Promise<void> | void): void {
    this.connections.set(this.toConnectionMapKey(protocol, connectionKey), { protocol, connectionKey, send });
  }

  bindDevice(protocol: TrackingProtocol, connectionKey: string, deviceId: string): void {
    const mapKey = this.toConnectionMapKey(protocol, connectionKey);
    if (!this.connections.has(mapKey)) return;
    this.deviceToConnection.set(this.toDeviceMapKey(protocol, deviceId), mapKey);
  }

  unregisterConnection(protocol: TrackingProtocol, connectionKey: string): void {
    const mapKey = this.toConnectionMapKey(protocol, connectionKey);
    this.connections.delete(mapKey);
    for (const [deviceKey, storedConnectionKey] of this.deviceToConnection.entries()) {
      if (storedConnectionKey === mapKey) {
        this.deviceToConnection.delete(deviceKey);
      }
    }
  }

  hasLiveConnection(protocol: TrackingProtocol, deviceId: string): boolean {
    const connectionKey = this.deviceToConnection.get(this.toDeviceMapKey(protocol, deviceId));
    if (!connectionKey) {
      return false;
    }
    if (!this.connections.has(connectionKey)) {
      this.deviceToConnection.delete(this.toDeviceMapKey(protocol, deviceId));
      return false;
    }
    return true;
  }

  async send(protocol: TrackingProtocol, deviceId: string, payload: Buffer): Promise<void> {
    const connectionKey = this.deviceToConnection.get(this.toDeviceMapKey(protocol, deviceId));
    if (!connectionKey) {
      throw new Error('Device is not connected for downlink commands');
    }
    const connection = this.connections.get(connectionKey);
    if (!connection) {
      this.deviceToConnection.delete(this.toDeviceMapKey(protocol, deviceId));
      throw new Error('Device connection is no longer available');
    }
    await connection.send(payload, deviceId);
  }

  private toConnectionMapKey(protocol: TrackingProtocol, connectionKey: string): string {
    return `${protocol}:${connectionKey}`;
  }

  private toDeviceMapKey(protocol: TrackingProtocol, deviceId: string): string {
    return `${protocol}:${deviceId}`;
  }
}

export const liveDeviceConnectionRegistry = new LiveDeviceConnectionRegistry();
