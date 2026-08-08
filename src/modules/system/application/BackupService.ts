import { createBackup, restoreBackup } from '../../../infrastructure/backup';

export class BackupService {
  async createBackup(backupDir: string): Promise<{ path: string; timestamp: string }> {
    const backupPath = await createBackup(backupDir);
    const timestamp = new Date().toISOString();
    return { path: backupPath, timestamp };
  }

  async restoreBackup(backupPath: string): Promise<{ status: string }> {
    await restoreBackup(backupPath);
    return { status: 'restored' };
  }
}
