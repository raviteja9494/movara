import { Prisma, type PrismaClient } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';

export type DeviceStatus = 'online' | 'offline';

export interface PacketAttributeSnapshot {
  packetId: string;
  updatedAt: Date;
  attributes: Record<string, unknown>;
}

export interface DeviceStateSnapshot {
  lastSeen: Date | null;
  status: DeviceStatus;
  protocol: TrackingProtocol;
  lastAttributes: Record<string, unknown> | null;
  packetAttributes: PacketAttributeSnapshot[];
}

export class DeviceStateStore {
  private readonly states = new Map<string, CachedDeviceState>();
  private readonly loading = new Map<string, Promise<CachedDeviceState | null>>();
  private readonly operations = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async updateLastSeen(imei: string, timestamp: Date = new Date()): Promise<void> {
    await this.serialize(imei, async () => {
      const state = await this.load(imei);
      if (!state) return;
      const clearsOfflineOverride = state.statusUpdatedAt == null || timestamp >= state.statusUpdatedAt;
      const statusChanged = clearsOfflineOverride && state.status !== 'online';
      state.lastSeen = timestamp;
      if (clearsOfflineOverride) {
        state.status = 'online';
        state.statusUpdatedAt = timestamp;
        state.dirtyStatus = true;
      }
      state.dirtyLastSeen = true;
      const time = this.now().getTime();
      if (statusChanged || state.lastSeenWrittenAt == null || time - state.lastSeenWrittenAt >= 30_000) {
        await this.writeState(state, ['lastSeen', ...(state.dirtyStatus ? ['status' as const] : [])]);
      }
    });
  }

  async setStatus(imei: string, status: DeviceStatus, timestamp: Date = new Date()): Promise<void> {
    if (status === 'online') {
      await this.updateLastSeen(imei, timestamp);
      return;
    }
    await this.serialize(imei, async () => {
      const state = await this.load(imei);
      if (!state) return;
      const statusChanged = state.status !== status;
      state.status = status;
      state.statusUpdatedAt = timestamp;
      state.lastSeen = timestamp;
      state.dirtyStatus = true;
      state.dirtyLastSeen = true;
      const time = this.now().getTime();
      if (statusChanged || state.lastSeenWrittenAt == null || time - state.lastSeenWrittenAt >= 30_000) {
        await this.writeState(state, ['status', 'lastSeen']);
      }
    });
  }

  async updateLastAttributes(
    imei: string,
    attributes: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (!attributes || Object.keys(attributes).length === 0) return;
    await this.serialize(imei, async () => {
      const state = await this.load(imei);
      if (!state) return;
      const merged = { ...(state.lastAttributes ?? {}), ...attributes };
      const changed = !isDeepStrictEqual(merged, state.lastAttributes ?? {});
      state.lastAttributes = merged;
      state.dirtyAttributes = true;
      const time = this.now().getTime();
      if (changed || state.attributesWrittenAt == null || time - state.attributesWrittenAt >= 60_000) {
        await this.writeState(state, ['attributes']);
      }
    });
  }

  async updatePacketAttributes(
    imei: string,
    packetId: string,
    attributes: Record<string, unknown> | null | undefined,
    updatedAt: Date = new Date(),
  ): Promise<void> {
    if (!attributes || Object.keys(attributes).length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({ where: { imei } });
      if (!device) return;
      const existing = await tx.devicePacketAttribute.findUnique({
        where: { deviceId_packetId: { deviceId: device.id, packetId } },
      });
      const merged = {
        ...(this.toAttributes(existing?.attributes) ?? {}),
        ...attributes,
      } as Prisma.InputJsonValue;
      await tx.devicePacketAttribute.upsert({
        where: { deviceId_packetId: { deviceId: device.id, packetId } },
        create: { userId: device.userId, deviceId: device.id, packetId, attributes: merged, updatedAt },
        update: { attributes: merged, updatedAt },
      });
    });
  }

  async updateProtocol(imei: string, protocol: TrackingProtocol): Promise<void> {
    if (protocol === 'unknown') return;
    await this.serialize(imei, async () => {
      const state = await this.load(imei);
      if (!state || state.protocol === protocol) return;
      const previousProtocol = state.protocol;
      state.protocol = protocol;
      const updated = await this.prisma.device.updateMany({ where: { id: state.id }, data: { protocol } });
      if (updated.count === 0) {
        state.protocol = previousProtocol;
        this.states.delete(imei);
      }
    });
  }

  async getLastSeen(imei: string): Promise<Date | null> {
    return (await this.load(imei))?.lastSeen ?? null;
  }

  async getLastAttributes(imei: string): Promise<Record<string, unknown> | null> {
    return (await this.load(imei))?.lastAttributes ?? null;
  }

  async getPacketAttributes(imei: string): Promise<PacketAttributeSnapshot[]> {
    const records = await this.prisma.devicePacketAttribute.findMany({
      where: { device: { imei } },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map((record) => ({
      packetId: record.packetId,
      updatedAt: record.updatedAt,
      attributes: this.toAttributes(record.attributes) ?? {},
    }));
  }

  async getProtocol(imei: string): Promise<TrackingProtocol> {
    return (await this.load(imei))?.protocol ?? 'unknown';
  }

  async getStatus(imei: string, thresholdMs: number = 120000): Promise<DeviceStatus> {
    const device = await this.load(imei);
    if (!device?.lastSeen) return 'offline';
    if (
      device.status === 'offline' &&
      device.statusUpdatedAt != null &&
      device.statusUpdatedAt.getTime() >= device.lastSeen.getTime()
    ) {
      return 'offline';
    }
    const effectiveThresholdMs = device.protocol === 'gt06' ? 10 * 60 * 1000 : thresholdMs;
    return this.now().getTime() - device.lastSeen.getTime() <= effectiveThresholdMs ? 'online' : 'offline';
  }

  async getSnapshot(imei: string): Promise<DeviceStateSnapshot> {
    const device = await this.load(imei);
    if (!device) {
      return {
        lastSeen: null,
        status: 'offline',
        protocol: 'unknown',
        lastAttributes: null,
        packetAttributes: [],
      };
    }
    const status = await this.getStatus(imei);
    const packetAttributes = await this.getPacketAttributes(imei);
    return {
      lastSeen: device.lastSeen,
      status,
      protocol: device.protocol,
      lastAttributes: device.lastAttributes,
      packetAttributes,
    };
  }

  async flush(): Promise<void> {
    for (const state of this.states.values()) {
      await this.serialize(state.imei, async () => {
        const fields: StateField[] = [];
        if (state.dirtyLastSeen) fields.push('lastSeen');
        if (state.dirtyStatus) fields.push('status');
        if (state.dirtyAttributes) fields.push('attributes');
        if (fields.length) await this.writeState(state, fields);
      });
    }
  }

  private async serialize(imei: string, action: () => Promise<void>): Promise<void> {
    const previous = this.operations.get(imei);
    const current = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(action);
    this.operations.set(imei, current);
    try {
      await current;
    } finally {
      if (this.operations.get(imei) === current) this.operations.delete(imei);
    }
  }

  private async load(imei: string): Promise<CachedDeviceState | null> {
    const cached = this.states.get(imei);
    if (cached) return cached;
    const pending = this.loading.get(imei);
    if (pending) return pending;
    const request = this.prisma.device.findUnique({ where: { imei } }).then((device) => {
      if (!device) return null;
      const state: CachedDeviceState = {
        imei,
        id: device.id,
        lastSeen: device.lastSeen,
        status: device.status as DeviceStatus,
        statusUpdatedAt: device.statusUpdatedAt,
        protocol: this.toProtocol(device.protocol),
        lastAttributes: this.toAttributes(device.lastAttributes),
        lastSeenWrittenAt: null,
        attributesWrittenAt: null,
        dirtyLastSeen: false,
        dirtyStatus: false,
        dirtyAttributes: false,
      };
      this.states.set(imei, state);
      return state;
    }).finally(() => this.loading.delete(imei));
    this.loading.set(imei, request);
    return request;
  }

  private async writeState(state: CachedDeviceState, fields: StateField[]): Promise<void> {
    const data: Record<string, unknown> = {};
    if (fields.includes('lastSeen') && state.dirtyLastSeen) data.lastSeen = state.lastSeen;
    if (fields.includes('status') && state.dirtyStatus) {
      data.status = state.status;
      data.statusUpdatedAt = state.statusUpdatedAt;
    }
    if (fields.includes('attributes') && state.dirtyAttributes) data.lastAttributes = state.lastAttributes as Prisma.InputJsonValue;
    if (!Object.keys(data).length) return;
    const updated = await this.prisma.device.updateMany({ where: { id: state.id }, data });
    if (updated.count === 0) {
      this.states.delete(state.imei);
      return;
    }
    const writtenAt = this.now().getTime();
    if ('lastSeen' in data) { state.dirtyLastSeen = false; state.lastSeenWrittenAt = writtenAt; }
    if ('status' in data) state.dirtyStatus = false;
    if ('lastAttributes' in data) { state.dirtyAttributes = false; state.attributesWrittenAt = writtenAt; }
  }

  private toProtocol(value: string | null | undefined): TrackingProtocol {
    return value === 'gt06' || value === 'eelink' || value === 'osmand' ? value : 'unknown';
  }

  private toAttributes(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
    return value != null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }
}

type StateField = 'lastSeen' | 'status' | 'attributes';
interface CachedDeviceState {
  imei: string;
  id: string;
  lastSeen: Date | null;
  status: DeviceStatus;
  statusUpdatedAt: Date | null;
  protocol: TrackingProtocol;
  lastAttributes: Record<string, unknown> | null;
  lastSeenWrittenAt: number | null;
  attributesWrittenAt: number | null;
  dirtyLastSeen: boolean;
  dirtyStatus: boolean;
  dirtyAttributes: boolean;
}
