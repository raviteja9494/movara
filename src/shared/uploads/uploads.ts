const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const ALLOWED_RECEIPT_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);

export function allowedVehiclePhotoExt(ext: string): boolean {
  return ALLOWED_IMAGE_EXT.has(ext.toLowerCase());
}

export function allowedReceiptExt(ext: string): boolean {
  return ALLOWED_RECEIPT_EXT.has(ext.toLowerCase());
}
