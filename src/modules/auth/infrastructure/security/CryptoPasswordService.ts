import crypto from 'crypto';
import type { PasswordService } from '../../domain/repositories';
export class CryptoPasswordService implements PasswordService {
  createSalt() { return crypto.randomBytes(16).toString('hex'); }
  hash(password: string, salt: string) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
}
