import type { PrismaClient } from '@prisma/client';

const MAX_ENTRIES = 500;

export interface RawLogEntry {
  at: string;
  port: number;
  raw: string;
  kind?: 'chunk' | 'packet' | 'connect' | 'tls-error' | 'socket-error';
  remoteAddress?: string;
}

export class PrismaRawLogStore {
  constructor(private readonly prisma: PrismaClient) {}

  async push(entry: Omit<RawLogEntry, 'at'>): Promise<void> {
    await this.prisma.rawLogEntry.create({
      data: {
        port: entry.port,
        raw: entry.raw,
        kind: entry.kind,
        remoteAddress: entry.remoteAddress,
      },
    });
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
