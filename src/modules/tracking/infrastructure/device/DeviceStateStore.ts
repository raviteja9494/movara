import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';

export type DeviceStatus = 'online' | 'offline';

export class DeviceStateStore {
  private lastSeen: Map<string, Date> = new Map();
  private lastAttributes: Map<string, Record<string, unknown>> = new Map();
  private protocolByDevice: Map<string, TrackingProtocol> = new Map();

  updateLastSeen(deviceId: string, timestamp: Date = new Date()): void {
    this.lastSeen.set(deviceId, timestamp);
  }

  updateLastAttributes(deviceId: string, attributes: Record<string, unknown> | null | undefined): void {
    if (!attributes || Object.keys(attributes).length === 0) return;
    this.lastAttributes.set(deviceId, {
      ...(this.lastAttributes.get(deviceId) ?? {}),
      ...attributes,
    });
  }

  getLastSeen(deviceId: string): Date | null {
    return this.lastSeen.get(deviceId) ?? null;
  }

  getLastAttributes(deviceId: string): Record<string, unknown> | null {
    return this.lastAttributes.get(deviceId) ?? null;
  }

  updateProtocol(deviceId: string, protocol: TrackingProtocol): void {
    if (protocol === 'unknown') return;
    this.protocolByDevice.set(deviceId, protocol);
  }

  getProtocol(deviceId: string): TrackingProtocol {
    return this.protocolByDevice.get(deviceId) ?? 'unknown';
  }

  getStatus(deviceId: string, thresholdMs: number = 120000): DeviceStatus {
    const last = this.getLastSeen(deviceId);
    if (!last) return 'offline';
    return Date.now() - last.getTime() <= thresholdMs ? 'online' : 'offline';
  }
}

export const deviceStateStore = new DeviceStateStore();
