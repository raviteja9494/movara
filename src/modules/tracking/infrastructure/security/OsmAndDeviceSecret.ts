import crypto from 'crypto';

const KEY_LENGTH = 64;

export function hashOsmAndDeviceSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, KEY_LENGTH);
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function verifyOsmAndDeviceSecret(secret: string | undefined, encodedHash: string): boolean {
  if (!secret) return false;
  const [saltBase64, hashBase64] = encodedHash.split(':');
  if (!saltBase64 || !hashBase64) return false;
  try {
    const salt = Buffer.from(saltBase64, 'base64');
    const expectedHash = Buffer.from(hashBase64, 'base64');
    const submittedHash = crypto.scryptSync(secret, salt, expectedHash.length);
    return expectedHash.length === submittedHash.length && crypto.timingSafeEqual(expectedHash, submittedHash);
  } catch {
    return false;
  }
}
