import crypto from 'crypto';
import { ConflictError } from '../../../../shared/errors';
import { User, type AuthUser } from '../../domain/entities';
import type { AuthRepository, PasswordService, TokenService } from '../../domain/repositories';
import { ConcurrentRegistrationError, DuplicateUserError, RegistrationDisabledError } from '../../domain/repositories';

export class InvalidCredentialsError extends Error {}

export class AuthUseCases {
  constructor(private readonly users: AuthRepository, private readonly passwords: PasswordService, private readonly tokens: TokenService, private readonly allowRegistrationAfterFirstUser: boolean) {}

  async register(email: string, password: string) {
    const salt = this.passwords.createSalt();
    const candidate = User.create(email, this.passwords.hash(password, salt), salt);
    try {
      const user = await this.users.register(candidate, this.allowRegistrationAfterFirstUser);
      return { user: this.publicUser(user), token: this.tokens.sign({ id: user.id, email: user.email }) };
    } catch (error) {
      if (error instanceof RegistrationDisabledError) throw new ConflictError('Registration is disabled after the first user has been created');
      if (error instanceof DuplicateUserError) throw new ConflictError('User with this email already exists');
      if (error instanceof ConcurrentRegistrationError) throw new ConflictError('Registration was attempted concurrently; please try again');
      throw error;
    }
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new InvalidCredentialsError();
    const submittedHash = Buffer.from(this.passwords.hash(password, user.salt));
    const storedHash = Buffer.from(user.passwordHash);
    if (submittedHash.length !== storedHash.length || !crypto.timingSafeEqual(submittedHash, storedHash)) {
      throw new InvalidCredentialsError();
    }
    return { user: this.publicUser(user), token: this.tokens.sign({ id: user.id, email: user.email }) };
  }

  verify(token: string): AuthUser | null { return this.tokens.verify(token); }
  private publicUser(user: User): AuthUser { return { id: user.id, email: user.email }; }
}
