import { Prisma, type PrismaClient } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaClient) {}

  async updateLastSeen(imei: string, timestamp: Date = new Date()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.device.findUnique({ where: { imei } });
      if (!existing) return;
      const clearsOfflineOverride =
        existing.statusUpdatedAt == null || timestamp.getTime() >= existing.statusUpdatedAt.getTime();
      await tx.device.update({
        where: { imei },
        data: {
          lastSeen: timestamp,
          ...(clearsOfflineOverride ? { status: 'online', statusUpdatedAt: timestamp } : {}),
        },
      });
    });
  }

  async setStatus(imei: string, status: DeviceStatus, timestamp: Date = new Date()): Promise<void> {
    if (status === 'online') {
      await this.updateLastSeen(imei, timestamp);
      return;
    }
    await this.prisma.device.updateMany({ where: { imei }, data: { status, statusUpdatedAt: timestamp, lastSeen: timestamp } });
  }

  async updateLastAttributes(
    imei: string,
    attributes: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (!attributes || Object.keys(attributes).length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({ where: { imei } });
      if (!device) return;
      const current = this.toAttributes(device.lastAttributes) ?? {};
      await tx.device.update({
        where: { id: device.id },
        data: {
          lastAttributes: {
            ...current,
            ...attributes,
          } as Prisma.InputJsonValue,
        },
      });
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
    await this.prisma.device.updateMany({ where: { imei }, data: { protocol } });
  }

  async getLastSeen(imei: string): Promise<Date | null> {
    return (await this.prisma.device.findUnique({ where: { imei }, select: { lastSeen: true } }))?.lastSeen ?? null;
  }

  async getLastAttributes(imei: string): Promise<Record<string, unknown> | null> {
    const device = await this.prisma.device.findUnique({
      where: { imei },
      select: { lastAttributes: true },
    });
    return this.toAttributes(device?.lastAttributes);
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
    const protocol = (await this.prisma.device.findUnique({
      where: { imei },
      select: { protocol: true },
    }))?.protocol;
    return this.toProtocol(protocol);
  }

  async getStatus(imei: string, thresholdMs: number = 120000): Promise<DeviceStatus> {
    const device = await this.prisma.device.findUnique({
      where: { imei },
      select: { lastSeen: true, status: true, statusUpdatedAt: true, protocol: true },
    });
    if (!device?.lastSeen) return 'offline';
    if (
      device.status === 'offline' &&
      device.statusUpdatedAt != null &&
      device.statusUpdatedAt.getTime() >= device.lastSeen.getTime()
    ) {
      return 'offline';
    }
    const effectiveThresholdMs = device.protocol === 'gt06' ? 10 * 60 * 1000 : thresholdMs;
    return Date.now() - device.lastSeen.getTime() <= effectiveThresholdMs ? 'online' : 'offline';
  }

  async getSnapshot(imei: string): Promise<DeviceStateSnapshot> {
    const device = await this.prisma.device.findUnique({
      where: { imei },
      include: { packetAttributes: { orderBy: { updatedAt: 'desc' } } },
    });
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
    return {
      lastSeen: device.lastSeen,
      status,
      protocol: this.toProtocol(device.protocol),
      lastAttributes: this.toAttributes(device.lastAttributes),
      packetAttributes: device.packetAttributes.map((record) => ({
        packetId: record.packetId,
        updatedAt: record.updatedAt,
        attributes: this.toAttributes(record.attributes) ?? {},
      })),
    };
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
