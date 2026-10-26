import path from 'path';
import { Prisma, type PrismaClient } from '@prisma/client';

export interface RuntimeSettings {
  protocolDebugEnabled: boolean;
  protocolDebugDir: string;
  protocolLogLevel: ProtocolLogLevel;
  appLogLevel: AppLogLevel;
  autoStopMinDurationMinutes: number;
  autoStopMoveThresholdMeters: number;
  autoStopMinPoints: number;
  stationaryFilter: StationaryFilterSettings;
  retention: RetentionSettings;
}

export interface StationaryFilterSettings {
  enabled: boolean;
  distanceMeters: number;
  heartbeatSeconds: number;
}

export interface RetentionSettings {
  enabled: boolean;
  days: number;
  lastRun: RetentionRunSummary | null;
}

export interface RetentionRunSummary {
  completedAt: string;
  cutoffAt: string;
  counts: Record<string, number>;
}

export type RuntimeSettingsPatch = Partial<Omit<RuntimeSettings, 'stationaryFilter' | 'retention'>> & {
  stationaryFilter?: Partial<StationaryFilterSettings>;
  retention?: Partial<Pick<RetentionSettings, 'enabled' | 'days'>>;
};

export const APP_LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type AppLogLevel = (typeof APP_LOG_LEVELS)[number];
export const PROTOCOL_LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'trace', 'raw'] as const;
export type ProtocolLogLevel = (typeof PROTOCOL_LOG_LEVELS)[number];

const SETTINGS_ID = 'runtime';

function envProtocolDebugEnabled(): boolean {
  const value = (process.env.PROTOCOL_DEBUG ?? '').trim().toLowerCase();
  if (!value) return false;
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
  return {
    protocolDebugEnabled: protocolLogLevel !== 'silent',
    protocolDebugDir: envProtocolDebugDir(),
    protocolLogLevel,
    appLogLevel: envAppLogLevel(),
    autoStopMinDurationMinutes: 3,
    autoStopMoveThresholdMeters: 60,
    autoStopMinPoints: 3,
    stationaryFilter: {
      enabled: true,
      distanceMeters: 15,
      heartbeatSeconds: 300,
    },
    retention: {
      enabled: false,
      days: 365,
      lastRun: null,
    },
  };
}

function normalize(settings: RuntimeSettingsPatch): RuntimeSettings {
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
    stationaryFilter: {
      enabled: typeof settings.stationaryFilter?.enabled === 'boolean'
        ? settings.stationaryFilter.enabled
        : base.stationaryFilter.enabled,
      distanceMeters:
        typeof settings.stationaryFilter?.distanceMeters === 'number' && Number.isFinite(settings.stationaryFilter.distanceMeters)
          ? Math.min(200, Math.max(1, Math.round(settings.stationaryFilter.distanceMeters)))
          : base.stationaryFilter.distanceMeters,
      heartbeatSeconds:
        typeof settings.stationaryFilter?.heartbeatSeconds === 'number' && Number.isFinite(settings.stationaryFilter.heartbeatSeconds)
          ? Math.min(3600, Math.max(30, Math.round(settings.stationaryFilter.heartbeatSeconds)))
          : base.stationaryFilter.heartbeatSeconds,
    },
    retention: {
      enabled: typeof settings.retention?.enabled === 'boolean'
        ? settings.retention.enabled
        : base.retention.enabled,
      days:
        typeof settings.retention?.days === 'number' && Number.isFinite(settings.retention.days)
          ? Math.max(30, Math.round(settings.retention.days))
          : base.retention.days,
      lastRun: (settings as RuntimeSettings).retention?.lastRun ?? base.retention.lastRun,
    },
  };
}

class RuntimeSettingsStore {
  // This is a derived read cache only. Postgres remains the authoritative state
  // and initialize() refreshes the cache at startup and after database restore.
  private cache: RuntimeSettings | null = null;
  private prisma: PrismaClient | null = null;

  async initialize(prisma: PrismaClient): Promise<void> {
    this.prisma = prisma;
    const record = await prisma.runtimeSettings.findUnique({ where: { id: SETTINGS_ID } });
    const configured = record?.value;
    const partial = configured && typeof configured === 'object' && !Array.isArray(configured)
      ? configured as RuntimeSettingsPatch
      : {};
    const next = normalize(partial);
    await prisma.runtimeSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, value: next as unknown as Prisma.InputJsonValue },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    this.cache = next;
  }

  get(): RuntimeSettings {
    return this.cache ?? defaults();
  }

  async update(partial: RuntimeSettingsPatch): Promise<RuntimeSettings> {
    if (!this.prisma) throw new Error('RuntimeSettingsStore has not been initialized');
    const next = normalize({
      ...this.get(),
      ...partial,
      stationaryFilter: {
        ...this.get().stationaryFilter,
        ...(partial.stationaryFilter ?? {}),
      },
      retention: {
        ...this.get().retention,
        ...(partial.retention ?? {}),
      },
    });
    await this.prisma.runtimeSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, value: next as unknown as Prisma.InputJsonValue },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    this.cache = next;
    return next;
  }

  async reset(): Promise<RuntimeSettings> {
    return this.update(defaults());
  }

  async recordRetentionRun(lastRun: RetentionRunSummary): Promise<void> {
    if (!this.prisma) throw new Error('RuntimeSettingsStore has not been initialized');
    const next = { ...this.get(), retention: { ...this.get().retention, lastRun } };
    await this.prisma.runtimeSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, value: next as unknown as Prisma.InputJsonValue },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    this.cache = next;
  }
}

export const runtimeSettingsStore = new RuntimeSettingsStore();
