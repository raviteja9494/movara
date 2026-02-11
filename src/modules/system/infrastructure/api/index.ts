import { FastifyInstance } from 'fastify';
import { BackupService } from '../../application/BackupService';

const backupService = new BackupService();

export async function registerSystemRoutes(app: FastifyInstance) {
  app.post('/api/v1/system/backup', async (request, reply) => {
    try {
      const { backupDir = './backups' } = request.body as { backupDir?: string };
      const result = await backupService.createBackup(backupDir);
      return reply.status(201).send({
        status: 'success',
        backup: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        status: 'error',
        error: message,
      });
    }
  });

  app.post('/api/v1/system/restore', async (request, reply) => {
    try {
      const { backupPath } = request.body as { backupPath: string };
      
      if (!backupPath) {
        return reply.status(400).send({
          status: 'error',
          error: 'backupPath is required',
        });
      }

      const result = await backupService.restoreBackup(backupPath);
      return reply.status(200).send({
        status: 'success',
        restore: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        status: 'error',
        error: message,
      });
    }
  });
}
