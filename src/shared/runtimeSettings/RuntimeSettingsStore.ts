import fs from 'fs';
import path from 'path';

export interface RuntimeSettings {
  protocolDebugEnabled: boolean;
  protocolDebugDir: string;
  protocolLogLevel: ProtocolLogLevel;
  appLogLevel: AppLogLevel;
  autoStopMinDurationMinutes: number;
  autoStopMoveThresholdMeters: number;
  autoStopMinPoints: number;
  homeAssistantEnabled: boolean;
  homeAssistantUrl: string;
  homeAssistantToken: string;
}

export const APP_LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type AppLogLevel = (typeof APP_LOG_LEVELS)[number];
export const PROTOCOL_LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'trace', 'raw'] as const;
export type ProtocolLogLevel = (typeof PROTOCOL_LOG_LEVELS)[number];

const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'runtime-settings.json');

function envProtocolDebugEnabled(): boolean {
  const value = (process.env.PROTOCOL_DEBUG ?? '').trim().toLowerCase();
  if (!value) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function envProtocolLogLevel(): ProtocolLogLevel {
  const explicit = (process.env.PROTOCOL_DEBUG_LEVEL ?? '').trim().toLowerCase();
  if (PROTOCOL_LOG_LEVELS.includes(explicit as ProtocolLogLevel)) {
    return explicit as ProtocolLogLevel;
  }
  if ((process.env.PROTOCOL_DEBUG ?? '').trim() !== '') {
    return envProtocolDebugEnabled() ? 'debug' : 'silent';
  }
  return 'silent';
}

function envProtocolDebugDir(): string {
  return path.resolve(process.cwd(), process.env.PROTOCOL_DEBUG_DIR || './protocol-logs');
}

function envAppLogLevel(): AppLogLevel {
  const value = (process.env.LOG_LEVEL ?? '').trim().toLowerCase();
  if (APP_LOG_LEVELS.includes(value as AppLogLevel)) {
    return value as AppLogLevel;
  }
  return 'silent';
}

function defaults(): RuntimeSettings {
  const protocolLogLevel = envProtocolLogLevel();
  const homeAssistantUrl = (process.env.HOME_ASSISTANT_URL ?? '').trim().replace(/\/$/, '');
  const homeAssistantToken = (process.env.HOME_ASSISTANT_TOKEN ?? '').trim();
  return {
    protocolDebugEnabled: protocolLogLevel !== 'silent',
    protocolDebugDir: envProtocolDebugDir(),
    protocolLogLevel,
    appLogLevel: envAppLogLevel(),
    autoStopMinDurationMinutes: 3,
    autoStopMoveThresholdMeters: 60,
    autoStopMinPoints: 3,
    homeAssistantEnabled: Boolean(homeAssistantUrl && homeAssistantToken),
    homeAssistantUrl,
    homeAssistantToken,
  };
}

function normalize(settings: Partial<RuntimeSettings>): RuntimeSettings {
  const base = defaults();
  const protocolLogLevel =
    typeof settings.protocolLogLevel === 'string' && PROTOCOL_LOG_LEVELS.includes(settings.protocolLogLevel as ProtocolLogLevel)
      ? settings.protocolLogLevel as ProtocolLogLevel
      : typeof settings.protocolDebugEnabled === 'boolean'
        ? settings.protocolDebugEnabled
          ? base.protocolLogLevel === 'silent'
            ? 'debug'
            : base.protocolLogLevel
          : 'silent'
        : base.protocolLogLevel;
  return {
    protocolDebugEnabled: protocolLogLevel !== 'silent',
    protocolDebugDir:
      typeof settings.protocolDebugDir === 'string' && settings.protocolDebugDir.trim()
        ? path.resolve(process.cwd(), settings.protocolDebugDir)
        : base.protocolDebugDir,
    protocolLogLevel,
    appLogLevel:
      typeof settings.appLogLevel === 'string' && APP_LOG_LEVELS.includes(settings.appLogLevel as AppLogLevel)
        ? settings.appLogLevel as AppLogLevel
        : base.appLogLevel,
    autoStopMinDurationMinutes:
      typeof settings.autoStopMinDurationMinutes === 'number' && Number.isFinite(settings.autoStopMinDurationMinutes)
        ? Math.min(60, Math.max(1, Math.round(settings.autoStopMinDurationMinutes)))
        : base.autoStopMinDurationMinutes,
    autoStopMoveThresholdMeters:
      typeof settings.autoStopMoveThresholdMeters === 'number' && Number.isFinite(settings.autoStopMoveThresholdMeters)
        ? Math.min(1000, Math.max(5, Math.round(settings.autoStopMoveThresholdMeters)))
        : base.autoStopMoveThresholdMeters,
    autoStopMinPoints:
      typeof settings.autoStopMinPoints === 'number' && Number.isFinite(settings.autoStopMinPoints)
        ? Math.min(20, Math.max(2, Math.round(settings.autoStopMinPoints)))
        : base.autoStopMinPoints,
    homeAssistantEnabled:
      typeof settings.homeAssistantEnabled === 'boolean'
        ? settings.homeAssistantEnabled
        : base.homeAssistantEnabled,
    homeAssistantUrl:
      typeof settings.homeAssistantUrl === 'string'
        ? settings.homeAssistantUrl.trim().replace(/\/$/, '')
        : base.homeAssistantUrl,
    homeAssistantToken:
      typeof settings.homeAssistantToken === 'string'
        ? settings.homeAssistantToken.trim()
        : base.homeAssistantToken,
  };
}

class RuntimeSettingsStore {
  private cache: RuntimeSettings | null = null;

  get(): RuntimeSettings {
    if (this.cache) return this.cache;
    this.cache = this.readFromDisk();
    return this.cache;
  }

  update(partial: Partial<RuntimeSettings>): RuntimeSettings {
    const next = normalize({
      ...this.get(),
      ...partial,
    });
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
    this.cache = next;
    return next;
  }

  private readFromDisk(): RuntimeSettings {
    try {
      if (!fs.existsSync(SETTINGS_FILE)) return defaults();
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<RuntimeSettings>;
      return normalize(parsed);
    } catch {
      return defaults();
    }
  }
}

export const runtimeSettingsStore = new RuntimeSettingsStore();
