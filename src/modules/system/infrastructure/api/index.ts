import { FastifyInstance } from 'fastify';
import { BackupService } from '../../application/BackupService';
import {
  validate,
  CreateBackupSchema,
  RestoreBackupSchema,
} from '../../../../shared/validation';

const backupService = new BackupService();

export async function registerSystemRoutes(app: FastifyInstance) {
  app.post('/api/v1/system/backup', async (request, reply) => {
    // Validate request body using shared validation layer
    // Throws ValidationError on failure - caught by global error handler
    const validatedData = validate(request.body ?? {}, CreateBackupSchema);
    const result = await backupService.createBackup(validatedData.backupDir ?? './backups');
    return reply.status(201).send({
      status: 'success',
      backup: result,
    });
  });

  app.post('/api/v1/system/restore', async (request, reply) => {
    // Validate request body using shared validation layer
    // Throws ValidationError on failure - caught by global error handler
    const validatedData = validate(request.body, RestoreBackupSchema);
    const result = await backupService.restoreBackup(validatedData.backupPath ?? '');
    return reply.status(200).send({
      status: 'success',
      restore: result,
    });
  });
}
