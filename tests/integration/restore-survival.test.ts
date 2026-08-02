import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(__dirname, '..', '..');
const composeFile = path.join(__dirname, 'docker-compose.yml');
const composeProject = `movara-restore-survival-${process.pid}`;
const prismaExecutable = path.join(
  repositoryRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);
const operatorToken = 'movara-restore-survival-admin-token-32-chars';

let app: FastifyInstance | undefined;
let baseUrl = '';
let token = '';
let scratchDir = '';
let composeStarted = false;
let disconnectDatabase: (() => Promise<void>) | undefined;

async function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return execFileAsync(command, args, {
    cwd: repositoryRoot,
    env,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function runPrisma(args: string[]) {
  if (process.platform === 'win32') {
    return run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', prismaExecutable, ...args]);
  }
  return run(prismaExecutable, args);
}

function composeArgs(...args: string[]): string[] {
  return ['compose', '-p', composeProject, '-f', composeFile, ...args];
}

async function http(
  route: string,
  options: {
    method?: string;
    body?: unknown;
    authenticated?: boolean;
  } = {},
) {
  const headers = new Headers({ 'X-Movara-Admin-Token': operatorToken });
  if (options.authenticated !== false && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const parsed = bytes.length > 0 && contentType.includes('json')
    ? JSON.parse(bytes.toString('utf8'))
    : null;
  return { status: response.status, body: parsed };
}

before(async () => {
  scratchDir = await mkdtemp(path.join(os.tmpdir(), 'movara-restore-survival-'));
  await run('docker', composeArgs('up', '-d', '--wait'));
  composeStarted = true;
  const { stdout: portOutput } = await run('docker', composeArgs('port', 'postgres', '5432'));
  const portMatch = portOutput.trim().match(/:(\d+)$/);
  assert.ok(portMatch, `Could not determine test Postgres port from: ${portOutput}`);

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'movara-restore-survival-test-secret-at-least-32-chars';
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.SYSTEM_ADMIN_TOKEN = operatorToken;
  process.env.DATABASE_URL = `postgresql://movara_test:movara_test@127.0.0.1:${portMatch[1]}/movara_test`;
  process.env.BACKUP_DIR = path.join(scratchDir, 'backups');
  process.env.LOG_LEVEL = 'silent';
  process.env.PROTOCOL_DEBUG = 'false';
  process.env.GT06_PORT = '0';
  process.env.EELINK_PORT = '0';
  process.env.OSMAND_PORT = '0';

  await runPrisma(['migrate', 'deploy', '--schema', path.join(repositoryRoot, 'prisma', 'schema.prisma')]);
  process.chdir(scratchDir);

  const { initializeErrorHandling } = await import('../../src/app');
  const { createCompositionRoot } = await import('../../src/composition-root');
  const compositionRoot = createCompositionRoot();
  await compositionRoot.initialize();
  disconnectDatabase = () => compositionRoot.disconnect();

  app = Fastify({ logger: false });
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
    xContentTypeOptions: true,
    xPoweredBy: false,
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.get('/health', async () => ({ status: 'ok' }));
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });
  await initializeErrorHandling(app);
  await compositionRoot.registerRoutes(app);
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
});

after(async () => {
  process.chdir(repositoryRoot);
  if (app) await app.close().catch(() => undefined);
  if (disconnectDatabase) await disconnectDatabase().catch(() => undefined);
  if (composeStarted) {
    await run('docker', composeArgs('down', '--volumes', '--remove-orphans')).catch(() => undefined);
  }
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
});

test('restore disconnects the pool first and the app keeps serving requests', async () => {
  const registration = await http('/api/v1/auth/register', {
    method: 'POST',
    authenticated: false,
    body: { email: 'restore-survival@example.com', password: 'current-password' },
  });
  assert.equal(registration.status, 201);
  token = registration.body.token;

  const fixtureVehicle = await http('/api/v1/vehicles', {
    method: 'POST',
    body: { name: 'Fixture Vehicle' },
  });
  assert.equal(fixtureVehicle.status, 201);
  const fixtureVehicleId = fixtureVehicle.body.vehicle.id;

  const backup = await http('/api/v1/system/backup', { method: 'POST', body: {} });
  assert.equal(backup.status, 201);
  const backupName = backup.body.backup.downloadPath;

  const transientVehicle = await http('/api/v1/vehicles', {
    method: 'POST',
    body: { name: 'Transient Vehicle' },
  });
  assert.equal(transientVehicle.status, 201);
  const transientVehicleId = transientVehicle.body.vehicle.id;

  const restore = await http('/api/v1/system/restore', {
    method: 'POST',
    body: { backupPath: backupName },
  });
  assert.equal(restore.status, 200);
  assert.deepEqual(restore.body, { status: 'success', restore: { status: 'restored' } });

  const health = await http('/health', { authenticated: false });
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: 'ok' });

  const missingTransient = await http(`/api/v1/vehicles/${transientVehicleId}`);
  assert.equal(missingTransient.status, 404);

  const restoredVehicle = await http(`/api/v1/vehicles/${fixtureVehicleId}`);
  assert.equal(restoredVehicle.status, 200);
  assert.equal(restoredVehicle.body.vehicle.name, 'Fixture Vehicle');
});
