import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { join } from 'path';

const execAsync = promisify(exec);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

interface BackupMetadata {
  timestamp: Date;
  version: string;
  database: string;
}

export async function createBackup(backupDir: string): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `backup-${timestamp}`);

  try {
    await fs.mkdir(backupPath, { recursive: true });

    // Extract database URL components
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1);
    const dbUser = url.username;
    const dbHost = url.hostname;
    const dbPort = url.port || '5432';
    const dbPassword = url.password;

    // Create environment for pg_dump with password
    const env = { ...process.env };
    if (dbPassword) {
      env.PGPASSWORD = dbPassword;
    }

    // Dump database
    const dumpFile = join(backupPath, 'db.sql');
    const dumpCommand = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -F p > "${dumpFile}"`;

    await execAsync(dumpCommand, { env });

    // Compress dump
    const dumpContent = await fs.readFile(dumpFile);
    const compressed = await gzipAsync(dumpContent);
    const compressedFile = join(backupPath, 'db.sql.gz');
    await fs.writeFile(compressedFile, compressed);
    await fs.unlink(dumpFile);

    // Write metadata
    const metadata: BackupMetadata = {
      timestamp: new Date(),
      version: process.env.npm_package_version || '0.1.0',
      database: dbName,
    };
    await fs.writeFile(
      join(backupPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
    );

    console.log(`Backup created at ${backupPath}`);
    return backupPath;
  } catch (err) {
    await fs.rm(backupPath, { recursive: true, force: true });
    throw new Error(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function restoreBackup(backupPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  try {
    // Verify backup structure
    await fs.access(join(backupPath, 'metadata.json'));
    await fs.access(join(backupPath, 'db.sql.gz'));

    // Read and decompress dump
    const compressedFile = join(backupPath, 'db.sql.gz');
    const compressed = await fs.readFile(compressedFile);
    const decompressed = await gunzipAsync(compressed);
    const dumpFile = join(backupPath, 'db.sql.restore');
    await fs.writeFile(dumpFile, decompressed);

    // Extract database URL components
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1);
    const dbUser = url.username;
    const dbHost = url.hostname;
    const dbPort = url.port || '5432';
    const dbPassword = url.password;

    // Create environment for psql with password
    const env = { ...process.env };
    if (dbPassword) {
      env.PGPASSWORD = dbPassword;
    }

    // Drop and recreate database
    const dropCommand = `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -tc "DROP DATABASE IF EXISTS ${dbName};"`;
    const createCommand = `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -tc "CREATE DATABASE ${dbName};"`;

    await execAsync(dropCommand, { env });
    await execAsync(createCommand, { env });

    // Restore dump
    const restoreCommand = `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${dumpFile}"`;
    await execAsync(restoreCommand, { env });

    await fs.unlink(dumpFile);

    console.log(`Restore completed from ${backupPath}`);
  } catch (err) {
    throw new Error(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
