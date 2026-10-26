import fs from 'fs';
import path from 'path';
import { runtimeSettingsStore } from '../runtimeSettings/RuntimeSettingsStore';

const LOG_FILE_PATTERN = /^(app|gt06|eelink|osmand)-\d{4}-\d{2}-\d{2}\.(jsonl|log)$/i;
const MAX_LOG_FILES_PER_PREFIX = 4;
const DEFAULT_MAX_LOG_FILE_MB = 20;
const writtenBytesByFile = new Map<string, number>();
const cappedFiles = new Set<string>();

export interface LogFileInfo {
  name: string;
  size: number;
  modifiedAt: string;
}

export interface LogFilePreview {
  name: string;
  content: string;
  truncated: boolean;
  size: number;
}

export function getLogsDir(): string {
  return runtimeSettingsStore.get().protocolDebugDir;
}

export function getDailyLogPath(prefix: string, at: Date, extension = 'jsonl'): string {
  const date = at.toISOString().slice(0, 10);
  return path.join(getLogsDir(), `${prefix}-${date}.${extension}`);
}

export function appendDailyLog(prefix: string, line: string, extension = 'jsonl'): void {
  const at = new Date();
  const filePath = getDailyLogPath(prefix, at, extension);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const maxFileBytes = getMaxLogFileBytes();
    const writtenBytes = writtenBytesByFile.get(filePath) ?? (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);
    writtenBytesByFile.set(filePath, writtenBytes);
    if (cappedFiles.has(filePath) || writtenBytes >= maxFileBytes) {
      warnFileCapReached(filePath, maxFileBytes);
      return;
    }
    const contents = `${line}\n`;
    const bytes = Buffer.byteLength(contents, 'utf8');
    if (writtenBytes + bytes > maxFileBytes) {
      warnFileCapReached(filePath, maxFileBytes);
      return;
    }
    fs.appendFileSync(filePath, contents, 'utf8');
    const nextWrittenBytes = writtenBytes + bytes;
    writtenBytesByFile.set(filePath, nextWrittenBytes);
    if (nextWrittenBytes >= maxFileBytes) {
      warnFileCapReached(filePath, maxFileBytes);
    }
    pruneOldLogs(prefix, extension);
  } catch (err) {
    console.error('[log-file-manager] Failed to write log file', err);
  }
}

function getMaxLogFileBytes(): number {
  const configured = process.env.PROTOCOL_LOG_MAX_FILE_MB?.trim();
  if (!configured) return DEFAULT_MAX_LOG_FILE_MB * 1024 * 1024;
  const megabytes = Number(configured);
  if (!Number.isFinite(megabytes)) return DEFAULT_MAX_LOG_FILE_MB * 1024 * 1024;
  return Math.max(1, megabytes) * 1024 * 1024;
}

function warnFileCapReached(filePath: string, maxFileBytes: number): void {
  if (cappedFiles.has(filePath)) return;
  cappedFiles.add(filePath);
  console.warn(`[log-file-manager] Protocol log file size cap reached: ${filePath} (${maxFileBytes} bytes)`);
}

export function listLogFiles(): LogFileInfo[] {
  const dir = getLogsDir();
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => LOG_FILE_PATTERN.test(name))
      .map((name) => {
        const fullPath = path.join(dir, name);
        const stat = fs.statSync(fullPath);
        return {
          name,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

export function readLogFile(name: string): string {
  const fullPath = resolveLogFilePath(name);
  return fs.readFileSync(fullPath, 'utf8');
}

export function previewLogFile(name: string, maxBytes = 200_000): LogFilePreview {
  const fullPath = resolveLogFilePath(name);
  const stat = fs.statSync(fullPath);
  const size = stat.size;
  const safeMaxBytes = Math.max(1_024, Math.min(maxBytes, 1_000_000));
  const start = Math.max(0, size - safeMaxBytes);
  const fd = fs.openSync(fullPath, 'r');
  try {
    const length = size - start;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    const content = buffer.toString('utf8');
    return {
      name,
      content: start > 0 ? `... preview truncated to last ${length} bytes ...\n${content}` : content,
      truncated: start > 0,
      size,
    };
  } finally {
    fs.closeSync(fd);
  }
}

export function deleteLogFile(name: string): void {
  const fullPath = resolveLogFilePath(name);
  fs.unlinkSync(fullPath);
  clearLogFileBookkeeping(fullPath);
}

export function getLogFilePath(name: string): string {
  return resolveLogFilePath(name);
}

function resolveLogFilePath(name: string): string {
  if (!LOG_FILE_PATTERN.test(name)) {
    throw new Error('Invalid log file');
  }
  const fullPath = path.resolve(path.join(getLogsDir(), name));
  if (!fullPath.startsWith(path.resolve(getLogsDir()))) {
    throw new Error('Invalid log file');
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error('Log file not found');
  }
  return fullPath;
}

function pruneOldLogs(prefix: string, extension: string): void {
  const dir = getLogsDir();
  if (!fs.existsSync(dir)) return;
  const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}-\\d{4}-\\d{2}-\\d{2}\\.${escapeRegExp(extension)}$`, 'i');
  const matches = fs.readdirSync(dir)
    .filter((name) => prefixPattern.test(name))
    .sort((a, b) => b.localeCompare(a));
  for (const name of matches.slice(MAX_LOG_FILES_PER_PREFIX)) {
    try {
      const fullPath = path.join(dir, name);
      fs.unlinkSync(fullPath);
      clearLogFileBookkeeping(fullPath);
    } catch {
      // Best-effort retention cleanup.
    }
  }
}

function clearLogFileBookkeeping(filePath: string): void {
  writtenBytesByFile.delete(filePath);
  cappedFiles.delete(filePath);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
