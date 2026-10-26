import { getApiBaseUrl } from './apiConfig';
import { getSystemAdminToken, getToken } from './tokenStorage';

const BASE = '/system';

function systemHeaders(json = false): HeadersInit {
  const token = getToken();
  const systemAdminToken = getSystemAdminToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(systemAdminToken ? { 'X-Movara-Admin-Token': systemAdminToken } : {}),
  };
}

export interface BackupResult {
  path: string;
  timestamp: string;
  downloadPath: string;
}

export interface CreateBackupResponse {
  status: string;
  backup: BackupResult;
}

export interface RestoreResponse {
  status: string;
  restore: { status: string };
}

export interface ClearDatabaseResponse {
  status: string;
  message: string;
}

/**
 * Export database: single request that returns .sql.gz file (like Export GPX).
 * Server creates backup in temp dir, streams file, then deletes temp – no backup folder needed.
 */
export async function exportDatabase(): Promise<void> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/backup/export`;
  const res = await fetch(url, {
    method: 'POST',
    headers: systemHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg =
      typeof err.message === 'string'
        ? err.message
        : typeof err.error === 'string'
          ? err.error
          : res.status === 401
            ? 'Not logged in'
            : res.statusText || 'Export failed';
    throw new Error(msg);
  }
  const blob = await res.blob();
  if (blob.size < 2) {
    const text = await blob.text();
    throw new Error(text || 'Export returned empty response');
  }
  const buf = await blob.arrayBuffer();
  const firstTwo = new Uint8Array(buf, 0, 2);
  if (firstTwo[0] !== 0x1f || firstTwo[1] !== 0x8b) {
    const text = new TextDecoder().decode(buf);
    throw new Error(text && text.length < 500 ? text : 'Export did not return a valid .sql.gz file');
  }
  const disposition = res.headers.get('Content-Disposition');
  const nameMatch = disposition?.match(/filename="?([^";]+)"?/);
  const filename = nameMatch ? nameMatch[1].trim() : `movara-backup-${new Date().toISOString().slice(0, 10)}.sql.gz`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/gzip' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function createBackup(): Promise<CreateBackupResponse> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/backup`;
  const res = await fetch(url, {
    method: 'POST',
    headers: systemHeaders(true),
    body: '{}',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

export async function downloadBackupFile(downloadPath: string): Promise<void> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/backup/download?path=${encodeURIComponent(downloadPath)}`;
  const res = await fetch(url, {
    headers: systemHeaders(),
  });
  if (!res.ok) throw new Error(res.status === 404 ? 'Backup not found' : 'Download failed');
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const nameMatch = disposition?.match(/filename="?([^";]+)"?/);
  const filename = nameMatch ? nameMatch[1] : `movara-backup-${downloadPath}.sql.gz`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function restoreBackupUpload(file: File): Promise<RestoreResponse> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/restore/upload`;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(url, {
    method: 'POST',
    headers: systemHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText || 'Import failed';
    throw new Error(msg);
  }
  return res.json();
}

export async function clearDatabase(): Promise<ClearDatabaseResponse> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/clear-database`;
  const res = await fetch(url, {
    method: 'POST',
    headers: systemHeaders(true),
    body: '{}',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

export interface ClearTripsResponse {
  status: string;
  message: string;
}

export interface RuntimeSettings {
  protocolDebugEnabled: boolean;
  protocolDebugDir: string;
  protocolLogLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'raw';
  appLogLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  autoStopMinDurationMinutes: number;
  autoStopMoveThresholdMeters: number;
  autoStopMinPoints: number;
  stationaryFilter: { enabled: boolean; distanceMeters: number; heartbeatSeconds: number };
  retention: { enabled: boolean; days: number; lastRun: RetentionRunSummary | null };
}

export interface RetentionCounts {
  trips: number;
  tripPositions: number;
  tripStops: number;
  positions: number;
  tripMerges: number;
  deviceCommands: number;
}

export interface RetentionRunSummary {
  completedAt: string;
  cutoffAt: string;
  counts: RetentionCounts;
}

export interface RetentionResult {
  cutoffAt: string;
  counts: RetentionCounts;
  oldestRemaining: {
    positions: string | null;
    trips: string | null;
    tripMerges: string | null;
    deviceCommands: string | null;
  };
}

export interface StorageSummary {
  databaseBytes: number;
  positions: { count: number; oldest: string | null; newest: string | null };
  trips: { count: number; favoriteCount: number };
  devices: { count: number };
}

export type RuntimeSettingsPatch = Partial<Omit<RuntimeSettings, 'retention' | 'stationaryFilter'>> & {
  retention?: Partial<Pick<RuntimeSettings['retention'], 'enabled' | 'days'>>;
  stationaryFilter?: Partial<RuntimeSettings['stationaryFilter']>;
};

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

export async function clearTrips(options?: { includeTracking?: boolean }): Promise<ClearTripsResponse> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/clear-trips`;
  const res = await fetch(url, {
    method: 'POST',
    headers: systemHeaders(true),
    body: JSON.stringify({ includeTracking: options?.includeTracking === true }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchRuntimeSettings(): Promise<{ settings: RuntimeSettings }> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/runtime-settings`;
  const res = await fetch(url, {
    headers: systemHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

export async function updateRuntimeSettings(payload: RuntimeSettingsPatch): Promise<{ settings: RuntimeSettings }> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/runtime-settings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: systemHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchRetention(): Promise<{
  settings: Pick<RuntimeSettings['retention'], 'enabled' | 'days'>;
  lastRun: RetentionRunSummary | null;
}> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const res = await fetch(`${base}${BASE}/retention`, { headers: systemHeaders() });
  if (!res.ok) throw new Error(`Failed to load retention settings (${res.status})`);
  return res.json();
}

export async function fetchStorage(): Promise<StorageSummary> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const res = await fetch(`${base}${BASE}/storage`, { headers: systemHeaders() });
  if (!res.ok) throw new Error(`Failed to load storage summary (${res.status})`);
  return res.json();
}

export async function previewRetention(): Promise<RetentionResult> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const res = await fetch(`${base}${BASE}/retention/preview`, { method: 'POST', headers: systemHeaders(true), body: '{}' });
  if (!res.ok) throw new Error(`Failed to preview retention (${res.status})`);
  return res.json();
}

export async function runRetention(): Promise<RetentionResult> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const res = await fetch(`${base}${BASE}/retention/run`, { method: 'POST', headers: systemHeaders(true), body: '{}' });
  if (!res.ok) throw new Error(`Failed to run retention (${res.status})`);
  return res.json();
}

export async function fetchLogFiles(): Promise<{ files: LogFileInfo[] }> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/logs`;
  const res = await fetch(url, {
    headers: systemHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchLogFileContent(name: string): Promise<string> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/logs/content?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: systemHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  return res.text();
}

export async function fetchLogFilePreview(name: string, maxBytes = 200000): Promise<LogFilePreview> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/logs/preview?name=${encodeURIComponent(name)}&maxBytes=${encodeURIComponent(String(maxBytes))}`;
  const res = await fetch(url, {
    headers: systemHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

export async function downloadLogFile(name: string): Promise<void> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/logs/download?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: systemHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const nameMatch = disposition?.match(/filename="?([^";]+)"?/);
  const filename = nameMatch ? nameMatch[1].trim() : name;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function deleteLogFile(name: string): Promise<void> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/logs?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: systemHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown; message?: string };
    const msg = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : res.statusText;
    throw new Error(msg);
  }
}
