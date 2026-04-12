import crypto from 'crypto';
import type { DeviceCommandRecord } from '../../application/device-commands/types';

const MAX_COMMAND_HISTORY = 200;

export class DeviceCommandStore {
  private records: DeviceCommandRecord[] = [];
  private payloadByRecordId = new Map<string, Buffer>();

  add(record: Omit<DeviceCommandRecord, 'id' | 'createdAt'>, payload?: Buffer): DeviceCommandRecord {
    const next: DeviceCommandRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...record,
    };
    if (payload) {
      this.payloadByRecordId.set(next.id, Buffer.from(payload));
    }
    this.records.unshift(next);
    if (this.records.length > MAX_COMMAND_HISTORY) {
      const removed = this.records.splice(MAX_COMMAND_HISTORY);
      for (const recordToRemove of removed) {
        this.payloadByRecordId.delete(recordToRemove.id);
      }
    }
    return next;
  }

  listByDevice(deviceId: string, limit = 20): DeviceCommandRecord[] {
    return this.records.filter((record) => record.deviceId === deviceId).slice(0, limit);
  }

  listPending(protocol: DeviceCommandRecord['protocol'], imei: string): Array<{ record: DeviceCommandRecord; payload: Buffer }> {
    return this.records
      .filter((record) => record.protocol === protocol && record.imei === imei && record.status === 'pending')
      .map((record) => ({
        record,
        payload: Buffer.from(this.payloadByRecordId.get(record.id) ?? Buffer.alloc(0)),
      }))
      .filter((entry) => entry.payload.length > 0);
  }

  markSent(id: string, serverFlag: number | null = null): DeviceCommandRecord | null {
    const record = this.records.find((item) => item.id === id);
    if (!record) return null;
    record.serverFlag = serverFlag;
    record.status = 'sent';
    record.sentAt = new Date();
    record.error = null;
    return record;
  }

  markFailed(id: string, error: string): DeviceCommandRecord | null {
    const record = this.records.find((item) => item.id === id);
    if (!record) return null;
    record.status = 'failed';
    record.error = error;
    return record;
  }

  attachResponse(protocol: DeviceCommandRecord['protocol'], imei: string, serverFlag: number, response: string): DeviceCommandRecord | null {
    const record = this.records.find((item) =>
      item.protocol === protocol &&
      item.imei === imei &&
      item.serverFlag === serverFlag,
    );
    if (!record) {
      return null;
    }
    record.status = 'responded';
    record.response = response;
    record.respondedAt = new Date();
    record.error = null;
    return record;
  }

  attachLatestResponse(protocol: DeviceCommandRecord['protocol'], imei: string, response: string): DeviceCommandRecord | null {
    const normalizedResponse = response.trim();
    const record = this.records.find((item) =>
      item.protocol === protocol &&
      item.imei === imei &&
      (item.status === 'sent' || item.status === 'pending' || (item.status === 'responded' && !item.response)) &&
      !item.error,
    );
    if (!record) {
      return null;
    }
    record.status = 'responded';
    record.response = normalizedResponse || null;
    record.respondedAt = new Date();
    record.error = null;
    return record;
  }
}

export const deviceCommandStore = new DeviceCommandStore();
