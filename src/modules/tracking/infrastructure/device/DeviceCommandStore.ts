import type { DeviceCommand, Device, PrismaClient } from '@prisma/client';
import type { DeviceCommandRecord } from '../../application/device-commands/types';
import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';

const MAX_COMMAND_HISTORY = 200;

type CommandWithDevice = DeviceCommand & { device: Pick<Device, 'imei'> };

export class DeviceCommandStore {
  constructor(private readonly prisma: PrismaClient) {}

  async add(
    record: Omit<DeviceCommandRecord, 'id' | 'createdAt'>,
    payload?: Buffer,
  ): Promise<DeviceCommandRecord> {
    const owner = await this.prisma.device.findUnique({ where: { id: record.deviceId }, select: { userId: true } });
    if (!owner) throw new Error('Device not found');
    const created = await this.prisma.deviceCommand.create({
      data: {
        userId: owner.userId,
        deviceId: record.deviceId,
        protocol: record.protocol,
        commandKey: record.commandKey,
        commandLabel: record.commandLabel,
        content: record.content,
        transport: record.transport,
        serverFlag: record.serverFlag ?? null,
        status: record.status,
        payload,
        sentAt: record.sentAt,
        respondedAt: record.respondedAt ?? null,
        response: record.response ?? null,
        error: record.error,
      },
      include: { device: { select: { imei: true } } },
    });
    const stale = await this.prisma.deviceCommand.findMany({
      where: { userId: owner.userId },
      orderBy: { createdAt: 'desc' },
      skip: MAX_COMMAND_HISTORY,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.deviceCommand.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
    }
    return this.toRecord(created);
  }

  async listByDevice(deviceId: string, limit = 20): Promise<DeviceCommandRecord[]> {
    const records = await this.prisma.deviceCommand.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { device: { select: { imei: true } } },
    });
    return records.map((record) => this.toRecord(record));
  }

  async listPending(
    protocol: DeviceCommandRecord['protocol'],
    imei: string,
  ): Promise<Array<{ record: DeviceCommandRecord; payload: Buffer }>> {
    const records = await this.prisma.deviceCommand.findMany({
      where: { protocol, status: 'pending', device: { imei }, payload: { not: null } },
      orderBy: { createdAt: 'asc' },
      include: { device: { select: { imei: true } } },
    });
    return records
      .filter((record) => record.payload != null && record.payload.length > 0)
      .map((record) => ({ record: this.toRecord(record), payload: Buffer.from(record.payload!) }));
  }

  async markSent(id: string, serverFlag: number | null = null): Promise<DeviceCommandRecord | null> {
    return this.updateExisting(id, {
      serverFlag,
      status: 'sent',
      sentAt: new Date(),
      error: null,
    });
  }

  async markFailed(id: string, error: string): Promise<DeviceCommandRecord | null> {
    return this.updateExisting(id, { status: 'failed', error });
  }

  async attachResponse(
    protocol: DeviceCommandRecord['protocol'],
    imei: string,
    serverFlag: number,
    response: string,
  ): Promise<DeviceCommandRecord | null> {
    const record = await this.prisma.deviceCommand.findFirst({
      where: { protocol, serverFlag, device: { imei } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return null;
    return this.updateExisting(record.id, {
      status: 'responded',
      response,
      respondedAt: new Date(),
      error: null,
    });
  }

  async attachLatestResponse(
    protocol: DeviceCommandRecord['protocol'],
    imei: string,
    response: string,
  ): Promise<DeviceCommandRecord | null> {
    const record = await this.prisma.deviceCommand.findFirst({
      where: {
        protocol,
        device: { imei },
        error: null,
        OR: [
          { status: { in: ['sent', 'pending'] } },
          { status: 'responded', response: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return null;
    return this.updateExisting(record.id, {
      status: 'responded',
      response: response.trim() || null,
      respondedAt: new Date(),
      error: null,
    });
  }

  private async updateExisting(
    id: string,
    data: {
      serverFlag?: number | null;
      status?: string;
      sentAt?: Date;
      respondedAt?: Date;
      response?: string | null;
      error?: string | null;
    },
  ): Promise<DeviceCommandRecord | null> {
    const existing = await this.prisma.deviceCommand.findUnique({ where: { id } });
    if (!existing) return null;
    const updated = await this.prisma.deviceCommand.update({
      where: { id },
      data,
      include: { device: { select: { imei: true } } },
    });
    return this.toRecord(updated);
  }

  private toRecord(record: CommandWithDevice): DeviceCommandRecord {
    return {
      id: record.id,
      deviceId: record.deviceId,
      imei: record.device.imei,
      protocol: record.protocol as TrackingProtocol,
      commandKey: record.commandKey,
      commandLabel: record.commandLabel,
      content: record.content,
      transport: record.transport as DeviceCommandRecord['transport'],
      serverFlag: record.serverFlag,
      status: record.status as DeviceCommandRecord['status'],
      createdAt: record.createdAt,
      sentAt: record.sentAt,
      respondedAt: record.respondedAt,
      response: record.response,
      error: record.error,
    };
  }
}
