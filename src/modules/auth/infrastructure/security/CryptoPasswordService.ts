import crypto from 'crypto';
import { promisify } from 'util';
import type { PasswordService } from '../../domain/repositories';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keyLength: number,
) => Promise<Buffer>;

export class CryptoPasswordService implements PasswordService {
  createSalt() { return crypto.randomBytes(16).toString('hex'); }

  async hash(password: string, salt: string): Promise<string> {
    return (await scrypt(password, salt, 64)).toString('hex');
  }

  async verify(password: string, salt: string, expectedHash: string): Promise<boolean> {
    const submittedHash = Buffer.from(await this.hash(password, salt));
    const storedHash = Buffer.from(expectedHash);
    return submittedHash.length === storedHash.length && crypto.timingSafeEqual(submittedHash, storedHash);
  }
}
