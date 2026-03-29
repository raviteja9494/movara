export type DeviceStatus = 'online' | 'offline';

export class DeviceStateStore {
  private lastSeen: Map<string, Date> = new Map();
  private lastAttributes: Map<string, Record<string, unknown>> = new Map();

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

  getStatus(deviceId: string, thresholdMs: number = 120000): DeviceStatus {
    const last = this.getLastSeen(deviceId);
    if (!last) return 'offline';
    return Date.now() - last.getTime() <= thresholdMs ? 'online' : 'offline';
  }
}

export const deviceStateStore = new DeviceStateStore();
