import { runtimeSettingsStore, type AppLogLevel, type ProtocolLogLevel } from '../runtimeSettings/RuntimeSettingsStore';
import { appendDailyLog } from '../logging/LogFileManager';

export interface ProtocolDebugEntry {
  protocol: 'gt06' | 'osmand' | 'eelink';
  direction?: 'in' | 'out' | 'meta';
  kind: string;
  port?: number;
  remoteAddress?: string;
  connectionId?: number;
  messageType?: string;
  imei?: string;
  deviceId?: string;
  valid?: boolean;
  action?: string;
  error?: string;
  raw?: string;
  details?: Record<string, unknown>;
}

export const protocolDebugLogger = {
  isEnabled(): boolean {
    return runtimeSettingsStore.get().protocolLogLevel !== 'silent';
  },

  getLevel(): ProtocolLogLevel {
    return runtimeSettingsStore.get().protocolLogLevel;
  },

  log(entry: ProtocolDebugEntry): void {
    const configuredLevel = this.getLevel();
    const entryLevel = this.levelFor(entry);
    if (!this.shouldLog(configuredLevel, entryLevel, entry)) return;

    const at = new Date();
    const record = {
      at: at.toISOString(),
      ...entry,
    };

    try {
      appendDailyLog(entry.protocol, JSON.stringify(record));
    } catch (err) {
      const logger = console;
      logger.error('[protocol-debug] Failed to write protocol debug log', err);
    }
  },

  levelFor(entry: ProtocolDebugEntry): AppLogLevel {
    if (entry.error) return 'error';
    if (entry.valid === false) return 'warn';
    if (entry.action === 'unknown') return 'warn';
    if (entry.direction === 'in' || entry.direction === 'out') {
      if (entry.kind === 'chunk' || entry.kind === 'packet') return 'trace';
      return 'debug';
    }
    if (entry.kind === 'parse' || entry.kind === 'persist') return 'debug';
    return 'info';
  },

  shouldLog(configuredLevel: ProtocolLogLevel, entryLevel: AppLogLevel, entry?: ProtocolDebugEntry): boolean {
    if (configuredLevel === 'raw') {
      return Boolean(entry?.raw) && (entry?.direction === 'in' || entry?.direction === 'out');
    }
    const rank: Record<AppLogLevel, number> = {
      silent: 0,
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5,
    };
    return rank[configuredLevel] >= rank[entryLevel];
  },
};
