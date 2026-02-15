import path from 'path';
import fs from 'fs';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

export const uploadsDir = UPLOADS_DIR;

export function getVehiclesUploadDir(): string {
  const dir = path.join(UPLOADS_DIR, 'vehicles');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getMaintenanceUploadDir(): string {
  const dir = path.join(UPLOADS_DIR, 'maintenance');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Safe path: must be under baseDir, no traversal. Returns full path or null. */
export function resolveSafePath(baseDir: string, relativePath: string): string | null {
  const resolved = path.resolve(baseDir, relativePath);
  if (!resolved.startsWith(path.resolve(baseDir))) return null;
  return resolved;
}

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const ALLOWED_RECEIPT_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);

export function allowedVehiclePhotoExt(ext: string): boolean {
  return ALLOWED_IMAGE_EXT.has(ext.toLowerCase());
}

export function allowedReceiptExt(ext: string): boolean {
  return ALLOWED_RECEIPT_EXT.has(ext.toLowerCase());
}
