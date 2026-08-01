import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';

interface ConnectionRegistration {
  protocol: TrackingProtocol;
  connectionKey: string;
  send: (payload: Buffer, deviceId: string) => Promise<void> | void;
  close?: () => void;
}

export class LiveDeviceConnectionRegistry {
  // TCP sockets and their connection-local routing cannot be serialized. This
  // registry intentionally remains process memory; all durable device state is
  // persisted through Prisma-backed stores.
  private connections = new Map<string, ConnectionRegistration>();
  private deviceToConnection = new Map<string, string>();
  private connectionToDevice = new Map<string, string>();

  registerConnection(
    protocol: TrackingProtocol,
    connectionKey: string,
    send: (payload: Buffer, deviceId: string) => Promise<void> | void,
    close?: () => void,
  ): void {
    this.connections.set(this.toConnectionMapKey(protocol, connectionKey), { protocol, connectionKey, send, close });
  }

  bindDevice(protocol: TrackingProtocol, connectionKey: string, deviceId: string): void {
    const mapKey = this.toConnectionMapKey(protocol, connectionKey);
    if (!this.connections.has(mapKey)) return;
    const deviceKey = this.toDeviceMapKey(protocol, deviceId);
    this.deviceToConnection.set(deviceKey, mapKey);
    this.connectionToDevice.set(mapKey, deviceId);
  }

  unregisterConnection(protocol: TrackingProtocol, connectionKey: string): void {
    const mapKey = this.toConnectionMapKey(protocol, connectionKey);
    this.connections.delete(mapKey);
    this.connectionToDevice.delete(mapKey);
    for (const [deviceKey, storedConnectionKey] of this.deviceToConnection.entries()) {
      if (storedConnectionKey === mapKey) {
        this.deviceToConnection.delete(deviceKey);
      }
    }
  }

  getBoundDevice(protocol: TrackingProtocol, connectionKey: string): string | undefined {
    return this.connectionToDevice.get(this.toConnectionMapKey(protocol, connectionKey));
  }

  getConnectionCount(protocol: TrackingProtocol): number {
    let count = 0;
    for (const registration of this.connections.values()) {
      if (registration.protocol === protocol) count += 1;
    }
    return count;
  }

  closeAll(protocol: TrackingProtocol): void {
    const registrations = [...this.connections.values()].filter((entry) => entry.protocol === protocol);
    for (const registration of registrations) {
      registration.close?.();
      this.unregisterConnection(registration.protocol, registration.connectionKey);
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
