import util from 'util';
import { appendDailyLog } from '../logging/LogFileManager';
import { runtimeSettingsStore, type AppLogLevel } from '../runtimeSettings/RuntimeSettingsStore';

const APP_LOG_PRIORITY: Record<AppLogLevel | 'fatal', number> = {
  silent: Infinity,
  error: 50,
  fatal: 60,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

function shouldWrite(level: string): boolean {
  const configured = runtimeSettingsStore.get().appLogLevel;
  const threshold = APP_LOG_PRIORITY[configured];
  const current = APP_LOG_PRIORITY[level as AppLogLevel | 'fatal'];
  if (threshold === Infinity) return false;
  return current != null && current >= threshold;
}

function serializeArg(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

function buildMessage(args: unknown[]): string {
  if (args.length === 0) return '';
  if (typeof args[0] === 'string') {
    return util.format(args[0], ...args.slice(1).map((arg) => serializeArg(arg)));
  }
  return args.map((arg) => {
    const safe = serializeArg(arg);
    return typeof safe === 'string' ? safe : util.inspect(safe, { depth: 6, breakLength: 120 });
  }).join(' ');
}

export const appFileLogger = {
  log(level: string, args: unknown[]): void {
    if (!shouldWrite(level)) return;
    // Do not store raw `args`: Pino/Fastify may pass req/res with circular refs (Socket), which breaks JSON.stringify.
    const record = {
      at: new Date().toISOString(),
      level,
      message: buildMessage(args),
    };
    appendDailyLog('app', JSON.stringify(record));
  },
};
