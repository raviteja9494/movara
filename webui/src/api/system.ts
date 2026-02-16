import { getApiBaseUrl } from './apiConfig';
import { getToken } from './tokenStorage';

const BASE = '/system';

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

export async function createBackup(): Promise<CreateBackupResponse> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/backup`;
  const token = getToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: '{}',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function downloadBackupFile(downloadPath: string): Promise<void> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/backup/download?path=${encodeURIComponent(downloadPath)}`;
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

export async function exportDatabase(): Promise<void> {
  const { backup } = await createBackup();
  await downloadBackupFile(backup.downloadPath);
}

export async function restoreBackupUpload(file: File): Promise<RestoreResponse> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/restore/upload`;
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function clearDatabase(): Promise<ClearDatabaseResponse> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${BASE}/clear-database`;
  const token = getToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: '{}',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
