import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { join } from 'path';

const execFileAsync = promisify(execFile);
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

    // Dump the whole database. All authoritative application state (including
    // settings, saved locations, device state/commands, raw logs, and uploads)
    // lives in Postgres, so no sidecar state files need to be added here.
    // Try pg_dump on PATH, then via Docker if not found.
    const dumpFile = join(backupPath, 'db.sql');
    const isWindows = process.platform === 'win32';
    const hostForDocker = dbHost === 'localhost' || dbHost === '127.0.0.1' ? 'host.docker.internal' : dbHost;

    let dumpErr: Error | null = null;
    try {
      await execFileAsync('pg_dump', ['-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', dbName, '-F', 'p', '-f', dumpFile], { env });
    } catch (e) {
      dumpErr = e instanceof Error ? e : new Error(String(e));
      if (isCommandNotFound(dumpErr)) {
        try {
          await execFileAsync(
            'docker',
            ['run', '--rm', '-e', 'PGPASSWORD', '-v', `${backupPath}:/out`, 'postgres:16-alpine', 'pg_dump', '-h', hostForDocker, '-p', dbPort, '-U', dbUser, '-d', dbName, '-F', 'p', '-f', '/out/db.sql'],
            { env: { ...env, PGPASSWORD: dbPassword || '' } },
          );
          dumpErr = null;
        } catch {
          dumpErr = new Error(
            isWindows
              ? 'pg_dump is not installed or not on PATH. Install PostgreSQL and add its bin folder to PATH (e.g. C:\\Program Files\\PostgreSQL\\16\\bin), or install Docker Desktop and ensure Docker is running so backup can use it.'
              : 'pg_dump is not installed or not on PATH. Install PostgreSQL client tools (e.g. postgresql-client) or run the app in Docker.'
          );
        }
      }
    }
    if (dumpErr) throw dumpErr;

    // Compress dump
    const dumpContent = await fs.readFile(dumpFile);
    const compressed = await gzipAsync(dumpContent);
    const compressedFile = join(backupPath, 'db.sql.gz');
    await fs.writeFile(compressedFile, compressed);
    await fs.unlink(dumpFile);

    // Write metadata
    const metadata: BackupMetadata = {
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.3.0',
      database: dbName,
    };
    await fs.writeFile(
      join(backupPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
    );

    console.log(`Backup created at ${backupPath}`);
    return backupPath;
  } catch (err) {
    await fs.rm(backupPath, { recursive: true, force: true }).catch(() => {});
    if (err instanceof Error && /pg_dump is not installed|not on PATH/.test(err.message)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Backup failed: ${msg}. Check that pg_dump can reach the database and the output directory is writable.`,
      { cause: err },
    );
  }
}

const PSQL_NOT_FOUND = /not recognized|not found|command not found|ENOENT/i;

function isCommandNotFound(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || PSQL_NOT_FOUND.test(error.message);
}

/** Run psql -tc "SQL" (or Docker equivalent) for DROP/CREATE DATABASE. */
async function runPsqlTcOrDocker(
  sql: string,
  env: NodeJS.ProcessEnv,
  dbHost: string,
  dbPort: string,
  dbUser: string,
  targetDb: string,
  dbPassword: string,
): Promise<void> {
  const hostForDocker = dbHost === 'localhost' || dbHost === '127.0.0.1' ? 'host.docker.internal' : dbHost;
  try {
    await execFileAsync('psql', ['-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', targetDb, '-tc', sql], { env });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (!isCommandNotFound(err)) throw err;
    await execFileAsync(
      'docker',
      ['run', '--rm', '-e', 'PGPASSWORD', 'postgres:16-alpine', 'psql', '-h', hostForDocker, '-p', dbPort, '-U', dbUser, '-d', targetDb, '-tc', sql],
      { env: { ...env, PGPASSWORD: dbPassword || '' } },
    );
  }
}

export async function restoreBackup(backupPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  const isWindows = process.platform === 'win32';
  const psqlHelp = isWindows
    ? 'Install PostgreSQL and add its bin folder to PATH (e.g. C:\\Program Files\\PostgreSQL\\16\\bin), or install Docker Desktop and ensure Docker is running.'
    : 'Install PostgreSQL client tools (e.g. postgresql-client) or run the app in Docker.';

  try {
    // Verify backup structure
    await fs.access(join(backupPath, 'metadata.json'));
    await fs.access(join(backupPath, 'db.sql.gz'));

    // Read and decompress dump
    const compressedFile = join(backupPath, 'db.sql.gz');
    const compressed = await fs.readFile(compressedFile);
    if (compressed.length < 2 || compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
      throw new Error('db.sql.gz is not a valid gzip file');
    }
    const decompressed = await gunzipAsync(compressed);
    const dumpFile = join(backupPath, 'db.sql.restore');
    await fs.writeFile(dumpFile, decompressed);

    // Extract database URL components
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1).replace(/^\/+/, '') || 'movara';
    const dbUser = url.username;
    const dbHost = url.hostname;
    const dbPort = url.port || '5432';
    const dbPassword = url.password;

    const env = { ...process.env };
    if (dbPassword) env.PGPASSWORD = dbPassword;

    const adminDb = 'postgres';
    const escapedDbName = dbName.replace(/'/g, "''");
    const terminateSql = `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${escapedDbName}' AND pid <> pg_backend_pid();`;
    const dropSql = `DROP DATABASE IF EXISTS "${dbName.replace(/"/g, '""')}";`;
    const createSql = `CREATE DATABASE "${dbName.replace(/"/g, '""')}";`;

    // Terminate all connections to the target DB so DROP can succeed (e.g. app pool, other sessions)
    await runPsqlTcOrDocker(terminateSql, env, dbHost, dbPort, dbUser, adminDb, dbPassword);
    // Drop/create via psql (or Docker); -tc runs one command
    await runPsqlTcOrDocker(dropSql, env, dbHost, dbPort, dbUser, adminDb, dbPassword);
    await runPsqlTcOrDocker(createSql, env, dbHost, dbPort, dbUser, adminDb, dbPassword);

    // Restore dump: try psql -f, then Docker with volume when psql not on PATH
    try {
      await execFileAsync('psql', ['-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', dbName, '-f', dumpFile], { env });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (!isCommandNotFound(err)) throw err;
      const hostForDocker = dbHost === 'localhost' || dbHost === '127.0.0.1' ? 'host.docker.internal' : dbHost;
      try {
        await execFileAsync(
          'docker',
          ['run', '--rm', '-e', 'PGPASSWORD', '-v', `${backupPath}:/data`, 'postgres:16-alpine', 'psql', '-h', hostForDocker, '-p', dbPort, '-U', dbUser, '-d', dbName, '-f', '/data/db.sql.restore'],
          { env: { ...env, PGPASSWORD: dbPassword || '' } },
        );
      } catch {
        throw new Error(`psql is not installed or not on PATH. ${psqlHelp}`);
      }
    }

    await fs.unlink(dumpFile);

    console.log(`Restore completed from ${backupPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Restore failed: ${msg}. Ensure the backup was exported from Movara and the database is reachable.`,
      { cause: err },
    );
  }
}
