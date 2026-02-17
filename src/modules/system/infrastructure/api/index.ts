import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { join } from 'path';
import { BackupService } from '../../application/BackupService';
import {
  validate,
  CreateBackupSchema,
  RestoreBackupSchema,
} from '../../../../shared/validation';
import { getPrismaClient } from '../../../../infrastructure/db';

const backupService = new BackupService();

function getBackupDir(): string {
  if (process.env.BACKUP_DIR) return process.env.BACKUP_DIR;
  return path.resolve(process.cwd(), 'backups');
}

export async function registerSystemRoutes(app: FastifyInstance) {
  /**
   * Export database: single request that creates backup in temp dir, returns .sql.gz file
   * (like Export GPX – browser downloads directly). Uses raw response so the body is never JSON-serialized.
   */
  app.post('/api/v1/system/backup/export', async (_request, reply) => {
    const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'movara-export-'));
    try {
      const result = await backupService.createBackup(tmpDir);
      const gzPath = join(result.path, 'db.sql.gz');
      await fs.access(gzPath);
      const buffer = await fs.readFile(gzPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `movara-backup-${timestamp}.sql.gz`;
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      });
      res.end(buffer);
      (reply as { sent?: boolean }).sent = true;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  app.post('/api/v1/system/backup', async (request, reply) => {
    const validatedData = validate(request.body ?? {}, CreateBackupSchema);
    const backupDir = validatedData.backupDir ?? getBackupDir();
    const result = await backupService.createBackup(backupDir);
    const basename = path.basename(result.path);
    return reply.status(201).send({
      status: 'success',
      backup: { path: result.path, timestamp: result.timestamp, downloadPath: basename },
    });
  });

  app.get<{ Querystring: { path: string } }>('/api/v1/system/backup/download', async (request, reply) => {
    const downloadPath = request.query.path;
    if (!downloadPath || downloadPath.includes('..') || path.isAbsolute(downloadPath)) {
      return reply.status(400).send({ error: 'Invalid path' });
    }
    const fullPath = join(getBackupDir(), downloadPath, 'db.sql.gz');
    try {
      await fs.access(fullPath);
    } catch {
      return reply.status(404).send({ error: 'Backup not found' });
    }
    const filename = `movara-backup-${downloadPath}.sql.gz`;
    const buffer = await fs.readFile(fullPath);
    return reply
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .type('application/gzip')
      .send(buffer);
  });

  app.post('/api/v1/system/restore', async (request, reply) => {
    const validatedData = validate(request.body, RestoreBackupSchema);
    const result = await backupService.restoreBackup(validatedData.backupPath ?? '');
    return reply.status(200).send({
      status: 'success',
      restore: result,
    });
  });

  app.post('/api/v1/system/restore/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'Backup file required (.sql.gz)' });
    const buffer = await data.toBuffer();
    if (buffer.length < 2) return reply.status(400).send({ error: 'File too small; expected a gzip backup (.sql.gz)' });
    const gzipMagic = buffer[0] === 0x1f && buffer[1] === 0x8b;
    if (!gzipMagic) {
      return reply.status(400).send({
        error: 'Invalid backup file. Upload a .sql.gz file exported from Movara (Settings → Export database).',
      });
    }
    const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'movara-restore-'));
    try {
      const gzPath = join(tmpDir, 'db.sql.gz');
      const metaPath = join(tmpDir, 'metadata.json');
      await fs.writeFile(gzPath, buffer);
      await fs.writeFile(metaPath, JSON.stringify({ timestamp: new Date().toISOString(), database: 'movara' }));
      const result = await backupService.restoreBackup(tmpDir);
      return reply.status(200).send({ status: 'success', restore: result });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  app.post<{ Body?: { includeTracking?: boolean } }>('/api/v1/system/clear-trips', async (request, reply) => {
    const includeTracking = request.body?.includeTracking === true;
    const prisma = getPrismaClient();
    await prisma.tripPosition.deleteMany({});
    await prisma.trip.deleteMany({});
    if (includeTracking) {
      await prisma.position.deleteMany({});
      await prisma.tripMerge.deleteMany({});
    }
    return reply.status(200).send({
      status: 'success',
      message: includeTracking ? 'Trips and tracking data cleared' : 'Trips cleared',
    });
  });

  app.post('/api/v1/system/clear-database', async (_request, reply) => {
    const prisma = getPrismaClient();
    await prisma.tripPosition.deleteMany({});
    await prisma.trip.deleteMany({});
    await prisma.fuelRecord.deleteMany({});
    await prisma.maintenanceRecord.deleteMany({});
    await prisma.position.deleteMany({});
    await prisma.tripMerge.deleteMany({});
    await prisma.vehicle.updateMany({ data: { deviceId: null } });
    await prisma.vehicle.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.user.deleteMany({});
    return reply.status(200).send({ status: 'success', message: 'Database cleared' });
  });
}
