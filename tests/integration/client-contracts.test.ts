import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(__dirname, '..', '..');
const composeFile = path.join(__dirname, 'docker-compose.yml');
const composeProject = `movara-client-contracts-${process.pid}`;
const prismaExecutable = path.join(
  repositoryRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);

let app: FastifyInstance | undefined;
let baseUrl = '';
let token = '';
let scratchDir = '';
let composeStarted = false;
let disconnectDatabase: (() => Promise<void>) | undefined;
let deviceStateStore: {
  updateProtocol(deviceImei: string, protocol: 'gt06' | 'eelink' | 'osmand' | 'unknown'): Promise<void>;
} | undefined;

type HttpResult = {
  status: number;
  // These tests deliberately inspect runtime JSON contracts rather than internal DTO types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
};

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
  options: { method?: string; body?: unknown; authenticated?: boolean; token?: string } = {},
): Promise<HttpResult> {
  const headers = new Headers();
  const requestToken = options.token ?? token;
  if (options.authenticated !== false && requestToken) {
    headers.set('Authorization', `Bearer ${requestToken}`);
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
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

function assertOwn(value: object, field: string): void {
  assert.ok(Object.hasOwn(value, field), `Expected response field ${field}`);
}

function assertNullableType(value: unknown, type: 'string' | 'number'): void {
  assert.ok(value === null || typeof value === type, `Expected ${type} or null, received ${typeof value}`);
}

function assertVehicleRecordDto(record: Record<string, unknown>): void {
  assert.equal(typeof record.id, 'string');
  assert.equal(typeof record.vehicleId, 'string');

  for (const field of [
    'vehicleName', 'type', 'subtype', 'title', 'date', 'notes', 'validFrom', 'validUntil', 'provider',
    'referenceNumber', 'reminderMode', 'attachmentPath',
  ]) {
    assertOwn(record, field);
    assertNullableType(record[field], 'string');
  }
  for (const field of [
    'amount', 'odometer', 'reminderDaysBefore', 'recurringIntervalDays', 'recurringIntervalKm',
  ]) {
    assertOwn(record, field);
    assertNullableType(record[field], 'number');
  }
}

before(async () => {
  scratchDir = await mkdtemp(path.join(os.tmpdir(), 'movara-client-contracts-'));
  await run('docker', composeArgs('up', '-d', '--wait'));
  composeStarted = true;
  const { stdout: portOutput } = await run('docker', composeArgs('port', 'postgres', '5432'));
  const portMatch = portOutput.trim().match(/:(\d+)$/);
  assert.ok(portMatch, `Could not determine test Postgres port from: ${portOutput}`);

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'movara-client-contract-secret-at-least-32-chars';
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.SYSTEM_ADMIN_TOKEN = 'movara-client-contract-admin-token-32-chars';
  process.env.DATABASE_URL = `postgresql://movara_test:movara_test@127.0.0.1:${portMatch[1]}/movara_test`;
  process.env.BACKUP_DIR = path.join(scratchDir, 'backups');
  process.env.PROTOCOL_DEBUG_DIR = path.join(scratchDir, 'logs');
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
  deviceStateStore = compositionRoot.deviceStateStore;
  disconnectDatabase = () => compositionRoot.disconnect();

  app = Fastify({ logger: false });
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
    xContentTypeOptions: true,
    xPoweredBy: false,
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
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

test('Android and Home Assistant client contracts', async (t) => {
  let deviceId = '';
  let vehicleId = '';
  const deviceImei = 'osmand-contract-phone';

  await t.test('registration and login expose the token both clients consume', async () => {
    const credentials = { email: 'client-contracts@example.com', password: 'contract-password' };
    const registration = await http('/api/v1/auth/register', {
      method: 'POST',
      body: credentials,
      authenticated: false,
    });
    assert.equal(registration.status, 201);
    assert.equal(typeof registration.body?.token, 'string');
    token = registration.body.token;

    const login = await http('/api/v1/auth/login', {
      method: 'POST',
      body: credentials,
      authenticated: false,
    });
    assert.equal(login.status, 200);
    assert.equal(typeof login.body?.token, 'string');
    token = login.body.token;
  });

  await t.test('refresh rotates a valid token and rejects invalid authorization', async () => {
    const originalToken = token;
    const refreshed = await http('/api/v1/auth/refresh', { method: 'POST' });
    assert.equal(refreshed.status, 200);
    assert.deepEqual(refreshed.body.user, { id: refreshed.body.user.id, email: 'client-contracts@example.com' });
    assert.notEqual(refreshed.body.token, originalToken);
    const vehicles = await http('/api/v1/vehicles?limit=1', { token: refreshed.body.token });
    assert.equal(vehicles.status, 200);
    token = refreshed.body.token;

    const missing = await http('/api/v1/auth/refresh', { method: 'POST', authenticated: false });
    assert.equal(missing.status, 401);
    const malformed = await http('/api/v1/auth/refresh', { method: 'POST', token: 'not-a-jwt' });
    assert.equal(malformed.status, 401);

    const [header, payload, signature] = originalToken.split('.');
    assert.ok(header && payload && signature);
    const tamperedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    const tampered = await http('/api/v1/auth/refresh', {
      method: 'POST',
      token: `${header}.${payload}.${tamperedSignature}`,
    });
    assert.equal(tampered.status, 401);
  });

  await t.test('Home Assistant snapshot keeps its primary and legacy-composed fields', async () => {
    const device = await http('/api/v1/devices', {
      method: 'POST',
      body: { imei: deviceImei, name: 'Contract phone' },
    });
    assert.equal(device.status, 201);
    deviceId = device.body.device.id;

    const vehicle = await http('/api/v1/vehicles', {
      method: 'POST',
      body: { name: 'Contract vehicle', deviceId },
    });
    assert.equal(vehicle.status, 201);
    vehicleId = vehicle.body.vehicle.id;

    const snapshot = await http('/api/v1/home-assistant/snapshot');
    assert.equal(snapshot.status, 200);
    assert.ok(Array.isArray(snapshot.body.devices));
    assert.ok(Array.isArray(snapshot.body.vehicles));

    const snapshotDevice = snapshot.body.devices.find((item: { id: string }) => item.id === deviceId);
    assert.ok(snapshotDevice);
    for (const field of [
      'id', 'imei', 'name', 'lastSeen', 'status', 'protocol', 'lastAttributes', 'packetAttributes',
      'latest_position', 'latest_command',
    ]) assertOwn(snapshotDevice, field);
    assert.ok(Array.isArray(snapshotDevice.packetAttributes));

    const snapshotVehicle = snapshot.body.vehicles.find((item: { id: string }) => item.id === vehicleId);
    assert.ok(snapshotVehicle);
    for (const field of ['id', 'name', 'summary', 'latest_trip']) assertOwn(snapshotVehicle, field);
    assert.ok(snapshotVehicle.summary && typeof snapshotVehicle.summary === 'object');
    assertOwn(snapshotVehicle.summary, 'odometerKm');
    assertOwn(snapshotVehicle.summary, 'fuel');
    assertNullableType(snapshotVehicle.summary.odometerKm, 'number');
    assert.ok(snapshotVehicle.summary.fuel && typeof snapshotVehicle.summary.fuel === 'object');
    for (const field of ['averageKmPerL', 'recordCount', 'totalCost']) {
      assertOwn(snapshotVehicle.summary.fuel, field);
    }
    assertNullableType(snapshotVehicle.summary.fuel.averageKmPerL, 'number');
    assert.equal(typeof snapshotVehicle.summary.fuel.recordCount, 'number');
    assertNullableType(snapshotVehicle.summary.fuel.totalCost, 'number');
  });

  await t.test('direct Android and Home Assistant fallback routes keep their wrappers', async () => {
    const devices = await http('/api/v1/devices');
    assert.equal(devices.status, 200);
    assert.ok(Array.isArray(devices.body.data));

    const vehicles = await http('/api/v1/vehicles?limit=100');
    assert.equal(vehicles.status, 200);
    assert.ok(Array.isArray(vehicles.body.data));

    const positions = await http(`/api/v1/positions/latest?deviceId=${deviceId}&limit=1`);
    assert.equal(positions.status, 200);
    assert.ok(Array.isArray(positions.body.positions));

    const createdTrip = await http('/api/v1/trips', {
      method: 'POST',
      body: {
        deviceId,
        vehicleId,
        name: 'Client contract trip',
        startTime: '2026-08-08T10:00:00.000Z',
        endTime: '2026-08-08T10:30:00.000Z',
        favorite: false,
      },
    });
    assert.equal(createdTrip.status, 201);
    const tripId = createdTrip.body.trip.id;

    const trips = await http('/api/v1/trips');
    assert.equal(trips.status, 200);
    assert.ok(Array.isArray(trips.body.data));

    const trip = await http(`/api/v1/trips/${tripId}`);
    assert.equal(trip.status, 200);
    assert.equal(typeof trip.body.trip?.id, 'string');
    assert.ok(Array.isArray(trip.body.positions));
    assert.ok(Array.isArray(trip.body.stops));

    await deviceStateStore!.updateProtocol(deviceImei, 'gt06');
    const commandHistory = await http(`/api/v1/devices/${deviceId}/commands`);
    assert.equal(commandHistory.status, 200);
    assert.ok(Array.isArray(commandHistory.body.commands));

    const command = await http(`/api/v1/devices/${deviceId}/commands`, {
      method: 'POST',
      body: { commandKey: 'gt06_custom', values: { content: 'STATUS#' } },
    });
    assert.equal(command.status, 200);
    assert.equal(typeof command.body.command?.id, 'string');
  });

  await t.test('vehicle-records CRUD matches Android VehicleRecordDto', async () => {
    const created = await http('/api/v1/vehicle-records', {
      method: 'POST',
      body: {
        vehicleId,
        type: 'document',
        subtype: 'registration',
        title: 'Registration certificate',
        date: '2026-08-08T00:00:00.000Z',
        amount: 125.5,
        odometer: 12345,
        notes: 'Android contract record',
        validFrom: '2026-08-08T00:00:00.000Z',
        validUntil: '2027-08-08T00:00:00.000Z',
        provider: 'Movara Test Provider',
        referenceNumber: 'REF-130',
        reminderMode: 'recurring_date',
        reminderDaysBefore: 7,
        recurringIntervalDays: 365,
        recurringIntervalKm: 10000,
      },
    });
    assert.equal(created.status, 201);
    assertVehicleRecordDto(created.body.record);
    const recordId = created.body.record.id;

    const listed = await http('/api/v1/vehicle-records?limit=100&page=1');
    assert.equal(listed.status, 200);
    assert.ok(Array.isArray(listed.body.data));
    const listedRecord = listed.body.data.find((item: { id: string }) => item.id === recordId);
    assert.ok(listedRecord);
    assertVehicleRecordDto(listedRecord);

    const updated = await http(`/api/v1/vehicle-records/${recordId}`, {
      method: 'PATCH',
      body: { title: 'Updated registration certificate', amount: 150.75 },
    });
    assert.equal(updated.status, 200);
    assertVehicleRecordDto(updated.body.record);
    assert.equal(updated.body.record.title, 'Updated registration certificate');
    assert.equal(updated.body.record.amount, 150.75);

    const deleted = await http(`/api/v1/vehicle-records/${recordId}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    const afterDelete = await http('/api/v1/vehicle-records?limit=100&page=1');
    assert.equal(afterDelete.status, 200);
    assert.equal(afterDelete.body.data.some((item: { id: string }) => item.id === recordId), false);
  });

  await t.test('vehicle summary returns derived fuel and reminder values', async () => {
    const now = new Date();
    const earlierFill = new Date(now.getTime() - 2 * 86400000);
    const laterFill = new Date(now.getTime() - 86400000);
    const validUntil = new Date(now.getTime() + 3 * 86400000);
    const firstFuel = await http(`/api/v1/vehicles/${vehicleId}/fuel-records`, {
      method: 'POST',
      body: { date: earlierFill.toISOString(), odometer: 1000, fuelQuantity: 25, fuelCost: 100 },
    });
    const secondFuel = await http(`/api/v1/vehicles/${vehicleId}/fuel-records`, {
      method: 'POST',
      body: { date: laterFill.toISOString(), odometer: 1500, fuelQuantity: 40, fuelCost: 160 },
    });
    assert.equal(firstFuel.status, 201);
    assert.equal(secondFuel.status, 201);

    const reminder = await http('/api/v1/vehicle-records', {
      method: 'POST',
      body: {
        vehicleId,
        type: 'document',
        subtype: 'registration',
        title: 'Summary reminder',
        date: now.toISOString(),
        validUntil: validUntil.toISOString(),
        reminderMode: 'on_date',
        reminderDaysBefore: 7,
      },
    });
    assert.equal(reminder.status, 201);

    const response = await http(`/api/v1/vehicles/${vehicleId}/summary`);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body), ['summary']);
    const summary = response.body.summary;
    assert.deepEqual(Object.keys(summary).sort(), ['fuel', 'odometerKm', 'reminders', 'vehicleId']);
    assert.equal(summary.vehicleId, vehicleId);
    assert.equal(summary.odometerKm, 1500);
    assert.deepEqual(summary.fuel, { averageKmPerL: 12.5, recordCount: 2, totalCost: 260 });
    assert.deepEqual(Object.keys(summary.reminders).sort(), ['items', 'status']);
    assert.equal(summary.reminders.status, 'due');
    assert.equal(summary.reminders.items.length, 1);
    const item = summary.reminders.items[0];
    assert.deepEqual(Object.keys(item).sort(), [
      'dueDate', 'dueOdometerKm', 'recordId', 'remainingDays', 'remainingKm', 'status', 'title',
    ]);
    assert.equal(item.recordId, reminder.body.record.id);
    assert.equal(item.title, 'Summary reminder');
    assert.equal(item.status, 'due');
    assert.equal(item.dueDate, validUntil.toISOString());
    assert.equal(item.dueOdometerKm, null);
    assert.equal(item.remainingKm, null);
    assert.ok(typeof item.remainingDays === 'number');
  });

  await t.test('mobile tracker-state matches Android TrackerStateRequest and response DTO', async () => {
    const response = await http('/api/v1/mobile/tracker-state', {
      method: 'POST',
      body: { deviceLabel: 'contract-phone', active: true, protocol: 'osmand' },
    });
    assert.equal(response.status, 200);
    assert.equal(typeof response.body.device?.id, 'string');
    assert.equal(typeof response.body.device?.imei, 'string');
    assert.equal(typeof response.body.device?.status, 'string');
    assert.equal(typeof response.body.device?.lastSeen, 'string');
    assert.equal(response.body.device?.protocol, 'osmand');
  });
});
