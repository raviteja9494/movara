import fs from 'fs';
import path from 'path';

export interface RuntimeSettings {
  protocolDebugEnabled: boolean;
  protocolDebugDir: string;
}

const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'runtime-settings.json');

function envProtocolDebugEnabled(): boolean {
  const value = (process.env.PROTOCOL_DEBUG ?? '').trim().toLowerCase();
  if (!value) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function envProtocolDebugDir(): string {
  return path.resolve(process.cwd(), process.env.PROTOCOL_DEBUG_DIR || './protocol-logs');
}

function defaults(): RuntimeSettings {
  return {
    protocolDebugEnabled: envProtocolDebugEnabled(),
    protocolDebugDir: envProtocolDebugDir(),
  };
}

function normalize(settings: Partial<RuntimeSettings>): RuntimeSettings {
  const base = defaults();
  return {
    protocolDebugEnabled:
      typeof settings.protocolDebugEnabled === 'boolean'
        ? settings.protocolDebugEnabled
        : base.protocolDebugEnabled,
    protocolDebugDir:
      typeof settings.protocolDebugDir === 'string' && settings.protocolDebugDir.trim()
        ? path.resolve(process.cwd(), settings.protocolDebugDir)
        : base.protocolDebugDir,
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
