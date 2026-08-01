import { Prisma, type PrismaClient } from '@prisma/client';
import { User } from '../../domain/entities';
import type { AuthRepository } from '../../domain/repositories';
import { ConcurrentRegistrationError, DuplicateUserError, RegistrationDisabledError } from '../../domain/repositories';

const toDomain = (row: { id: string; email: string; passwordHash: string; salt: string; createdAt: Date }) => new User(row.id, row.email, row.passwordHash, row.salt, row.createdAt);

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async register(user: User, allowAfterFirstUser: boolean): Promise<User> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (await tx.user.count() > 0 && !allowAfterFirstUser) throw new RegistrationDisabledError();
        if (await tx.user.findUnique({ where: { email: user.email } })) throw new DuplicateUserError();
        return toDomain(await tx.user.create({ data: { id: user.id, email: user.email, passwordHash: user.passwordHash, salt: user.salt, createdAt: user.createdAt } }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateUserError();
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConcurrentRegistrationError();
      throw error;
    }
  }
  async findByEmail(email: string) { const row = await this.prisma.user.findUnique({ where: { email } }); return row ? toDomain(row) : null; }
}
