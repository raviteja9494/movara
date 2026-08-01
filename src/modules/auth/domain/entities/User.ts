export class User {
  constructor(readonly id: string, readonly email: string, readonly passwordHash: string, readonly salt: string, readonly createdAt: Date) {}
  static create(email: string, passwordHash: string, salt: string) { return new User(crypto.randomUUID(), email, passwordHash, salt, new Date()); }
}
export interface AuthUser { id: string; email: string }
