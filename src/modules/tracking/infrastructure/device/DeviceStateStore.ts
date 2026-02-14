export type DeviceStatus = 'online' | 'offline';

export class DeviceStateStore {
  private lastSeen: Map<string, Date> = new Map();

  updateLastSeen(deviceId: string, timestamp: Date = new Date()): void {
    this.lastSeen.set(deviceId, timestamp);
  }

  getLastSeen(deviceId: string): Date | null {
    return this.lastSeen.get(deviceId) ?? null;
  }

  getStatus(deviceId: string, thresholdMs: number = 120000): DeviceStatus {
    const last = this.getLastSeen(deviceId);
    if (!last) return 'offline';
    return Date.now() - last.getTime() <= thresholdMs ? 'online' : 'offline';
  }
}

export const deviceStateStore = new DeviceStateStore();
