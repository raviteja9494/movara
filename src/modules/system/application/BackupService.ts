import { createBackup, restoreBackup } from '../../../infrastructure/backup';
import type { PrismaClient } from '@prisma/client';

export class BackupService {
  constructor(private readonly prisma: PrismaClient) {}

  async createBackup(backupDir: string): Promise<{ path: string; timestamp: string }> {
    const backupPath = await createBackup(backupDir);
    const timestamp = new Date().toISOString();
    return { path: backupPath, timestamp };
  }

  async restoreBackup(backupPath: string): Promise<{ status: string }> {
    await restoreBackup(backupPath);
    await this.prisma.$disconnect();
    return { status: 'restored' };
  }
}
