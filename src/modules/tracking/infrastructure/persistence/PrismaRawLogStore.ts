import type { PrismaClient } from '@prisma/client';
import { runtimeSettingsStore } from '../../../../shared/runtimeSettings/RuntimeSettingsStore';

const MAX_ENTRIES = 500;
const TRIM_EVERY_INSERTS = 50;
const IMPORTANT_KINDS = new Set(['connect', 'parse-error', 'rejected', 'unknown']);

export interface RawLogEntry {
  at: string;
  port: number;
  raw: string;
  kind?: 'chunk' | 'packet' | 'connect' | 'tls-error' | 'socket-error' | 'parse-error' | 'rejected' | 'unknown';
  remoteAddress?: string;
}

export class PrismaRawLogStore {
  private insertsSinceTrim = 0;

  constructor(private readonly prisma: PrismaClient) {}

  async push(entry: Omit<RawLogEntry, 'at'>, options: { onlyWhenDebugOff?: boolean } = {}): Promise<void> {
    const debugEnabled = runtimeSettingsStore.get().protocolDebugEnabled;
    if (options.onlyWhenDebugOff && debugEnabled) return;
    if (!debugEnabled && !IMPORTANT_KINDS.has(entry.kind ?? '')) return;
    await this.prisma.rawLogEntry.create({
      data: {
        port: entry.port,
        raw: entry.raw,
        kind: entry.kind,
        remoteAddress: entry.remoteAddress,
      },
    });
    this.insertsSinceTrim += 1;
    if (this.insertsSinceTrim < TRIM_EVERY_INSERTS) return;
    this.insertsSinceTrim = 0;
    const stale = await this.prisma.rawLogEntry.findMany({
      orderBy: { at: 'desc' },
      skip: MAX_ENTRIES,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.rawLogEntry.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
    }
  }

  async getEntries(filters?: { port?: number; limit?: number }): Promise<RawLogEntry[]> {
    const records = await this.prisma.rawLogEntry.findMany({
      where: filters?.port != null ? { port: filters.port } : undefined,
      orderBy: { at: 'desc' },
      take: Math.min(filters?.limit ?? 100, 200),
    });
    return records.map((record) => ({
      at: record.at.toISOString(),
      port: record.port,
      raw: record.raw,
      kind: record.kind as RawLogEntry['kind'],
      remoteAddress: record.remoteAddress ?? undefined,
    }));
  }

  async clear(): Promise<void> {
    await this.prisma.rawLogEntry.deleteMany({});
  }
}
