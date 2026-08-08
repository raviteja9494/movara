export interface SystemDeviceStateSnapshot {
  lastSeen: Date | null;
  status: 'online' | 'offline';
  protocol: 'gt06' | 'eelink' | 'osmand' | 'unknown';
  lastAttributes: Record<string, unknown> | null;
  packetAttributes: Array<{
    packetId: string;
    updatedAt: Date;
    attributes: Record<string, unknown>;
  }>;
}

export interface SystemDeviceStateReader {
  getSnapshot(imei: string): Promise<SystemDeviceStateSnapshot>;
}

export interface SystemDeviceCommandRecord {
  id: string;
  deviceId: string;
  imei: string;
  protocol: 'gt06' | 'eelink' | 'osmand' | 'unknown';
  commandKey: string;
  commandLabel: string;
  content: string;
  transport: 'eelink_0x80' | 'gt06_0x80';
  serverFlag?: number | null;
  status: 'pending' | 'sent' | 'responded' | 'failed';
  createdAt: Date;
  sentAt: Date | null;
  respondedAt?: Date | null;
  response?: string | null;
  error: string | null;
}

export interface SystemDeviceCommandReader {
  listByDevice(deviceId: string, limit?: number): Promise<SystemDeviceCommandRecord[]>;
}
