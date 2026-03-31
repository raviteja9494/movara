/**
 * In-memory buffer of raw protocol traffic for debugging.
 * Not persisted; cleared on server restart.
 * Circular: when max entries reached, oldest entries are trimmed (no memory leak).
 */

const MAX_ENTRIES = 500;

export interface RawLogEntry {
  at: string;
  port: number;
  raw: string;
  kind?: 'chunk' | 'packet' | 'connect' | 'tls-error' | 'socket-error';
  remoteAddress?: string;
}

const buffer: RawLogEntry[] = [];

function trimToMax(): void {
  while (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

export const rawLogBuffer = {
  push(entry: Omit<RawLogEntry, 'at'>): void {
    buffer.push({
      ...entry,
      at: new Date().toISOString(),
    });
    trimToMax();
  },

  getEntries(filters?: { port?: number; limit?: number }): RawLogEntry[] {
    let list = [...buffer].reverse();
    if (filters?.port != null) {
      list = list.filter((e) => e.port === filters.port);
    }
    const limit = Math.min(filters?.limit ?? 100, 200);
    return list.slice(0, limit);
  },

  clear(): void {
    buffer.length = 0;
  },
};
