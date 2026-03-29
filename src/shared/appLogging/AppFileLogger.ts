import util from 'util';
import { appendDailyLog } from '../logging/LogFileManager';

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
    // Do not store raw `args`: Pino/Fastify may pass req/res with circular refs (Socket), which breaks JSON.stringify.
    const record = {
      at: new Date().toISOString(),
      level,
      message: buildMessage(args),
    };
    appendDailyLog('app', JSON.stringify(record));
  },
};
