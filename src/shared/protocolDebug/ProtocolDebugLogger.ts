import { runtimeSettingsStore } from '../runtimeSettings/RuntimeSettingsStore';
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
    return runtimeSettingsStore.get().protocolDebugEnabled;
  },

  log(entry: ProtocolDebugEntry): void {
    if (!this.isEnabled()) return;

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
};
