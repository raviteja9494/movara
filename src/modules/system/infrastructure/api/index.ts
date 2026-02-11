import { FastifyInstance } from 'fastify';
import { BackupService } from '../../application/BackupService';
import {
  validate,
  ValidationError,
  CreateBackupSchema,
  RestoreBackupSchema,
} from '../../../../shared/validation';

const backupService = new BackupService();

export async function registerSystemRoutes(app: FastifyInstance) {
  app.post('/api/v1/system/backup', async (request, reply) => {
    try {
      // Validate request body using shared validation layer
      const validatedData = validate(request.body ?? {}, CreateBackupSchema);
      const result = await backupService.createBackup(validatedData.backupDir);
      return reply.status(201).send({
        status: 'success',
        backup: result,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send(err.toJSON());
      }

      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        status: 'error',
        error: message,
      });
    }
  });

  app.post('/api/v1/system/restore', async (request, reply) => {
    try {
      // Validate request body using shared validation layer
      const validatedData = validate(request.body, RestoreBackupSchema);
      const result = await backupService.restoreBackup(validatedData.backupPath);
      return reply.status(200).send({
        status: 'success',
        restore: result,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send(err.toJSON());
      }

      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        status: 'error',
        error: message,
      });
    }
  });
}
