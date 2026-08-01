import { fromBuffer } from 'file-type';

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const ALLOWED_RECEIPT_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);
const FILE_TYPES_BY_EXTENSION = new Map([
  ['.jpg', { detectedExtension: 'jpg', mimeType: 'image/jpeg' }],
  ['.jpeg', { detectedExtension: 'jpg', mimeType: 'image/jpeg' }],
  ['.png', { detectedExtension: 'png', mimeType: 'image/png' }],
  ['.gif', { detectedExtension: 'gif', mimeType: 'image/gif' }],
  ['.webp', { detectedExtension: 'webp', mimeType: 'image/webp' }],
  ['.pdf', { detectedExtension: 'pdf', mimeType: 'application/pdf' }],
]);

export function allowedVehiclePhotoExt(ext: string): boolean {
  return ALLOWED_IMAGE_EXT.has(ext.toLowerCase());
}

export function allowedReceiptExt(ext: string): boolean {
  return ALLOWED_RECEIPT_EXT.has(ext.toLowerCase());
}

export async function uploadedFileMatchesExtensionAndMime(
  bytes: Buffer,
  extension: string,
  mimeType: string,
): Promise<boolean> {
  const expected = FILE_TYPES_BY_EXTENSION.get(extension.toLowerCase());
  if (!expected || mimeType.toLowerCase() !== expected.mimeType) return false;
  try {
    const detected = await fromBuffer(bytes);
    return detected?.ext === expected.detectedExtension && detected.mime === expected.mimeType;
  } catch {
    return false;
  }
}
