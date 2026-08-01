import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(__dirname, '..', '..');
const composeFile = path.join(__dirname, 'docker-compose.yml');
const composeProject = `movara-integration-${process.pid}`;
const prismaExecutable = path.join(
  repositoryRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);

let app: FastifyInstance | undefined;
let baseUrl = '';
let token = '';
let userId = '';
let secondToken = '';
const operatorToken = 'movara-integration-system-admin-token-32-chars';
let scratchDir = '';
let composeStarted = false;
let disconnectDatabase: (() => Promise<void>) | undefined;
let deviceStateStore: {
  updateProtocol(deviceId: string, protocol: 'gt06' | 'eelink' | 'osmand' | 'unknown'): Promise<void>;
} | undefined;

type HttpResult = {
  status: number;
  headers: Headers;
  body: any;
  bytes: Buffer;
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
  options: {
    method?: string;
    body?: unknown;
    form?: FormData;
    authenticated?: boolean;
    token?: string;
    admin?: boolean;
  } = {},
): Promise<HttpResult> {
  const headers = new Headers();
  const requestToken = options.token ?? token;
  if (options.authenticated !== false && requestToken) {
    headers.set('Authorization', `Bearer ${requestToken}`);
  }
  if (options.admin !== false) headers.set('X-Movara-Admin-Token', operatorToken);
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
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
  let parsed: unknown = null;
  if (bytes.length > 0) {
    parsed = contentType.includes('json') ? JSON.parse(bytes.toString('utf8')) : bytes.toString('utf8');
  }
  return { status: response.status, headers: response.headers, body: parsed, bytes };
}

async function json(method: string, route: string, body?: unknown): Promise<HttpResult> {
  return http(route, { method, body });
}

function multipartFile(filename: string, content: string | Buffer, type: string): FormData {
  const form = new FormData();
  form.set('file', new Blob([content as unknown as BlobPart], { type }), filename);
  return form;
}

before(async () => {
  scratchDir = await mkdtemp(path.join(os.tmpdir(), 'movara-integration-'));
  await run('docker', composeArgs('up', '-d', '--wait'));
  composeStarted = true;
  const { stdout: portOutput } = await run('docker', composeArgs('port', 'postgres', '5432'));
  const portMatch = portOutput.trim().match(/:(\d+)$/);
  assert.ok(portMatch, `Could not determine test Postgres port from: ${portOutput}`);

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'movara-integration-test-secret-at-least-32-chars';
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.SYSTEM_ADMIN_TOKEN = operatorToken;
  process.env.DATABASE_URL = `postgresql://movara_test:movara_test@127.0.0.1:${portMatch[1]}/movara_test`;
  process.env.BACKUP_DIR = path.join(scratchDir, 'backups');
  process.env.PROTOCOL_DEBUG_DIR = path.join(scratchDir, 'logs');
  process.env.LOG_LEVEL = 'silent';
  process.env.PROTOCOL_DEBUG = 'false';
  process.env.GT06_PORT = '0';
  process.env.EELINK_PORT = '0';
  process.env.OSMAND_PORT = '0';

  await runPrisma(['migrate', 'deploy', '--schema', path.join(repositoryRoot, 'prisma', 'schema.prisma')]);

  // Backup and diagnostic log routes still create operational artifacts. Keeping
  // cwd in a disposable directory prevents those test outputs changing developer files.
  process.chdir(scratchDir);

  const { initializeErrorHandling } = await import('../../src/app');
  const { createCompositionRoot } = await import('../../src/composition-root');
  const compositionRoot = createCompositionRoot();
  await compositionRoot.initialize();
  deviceStateStore = compositionRoot.deviceStateStore;
  disconnectDatabase = () => compositionRoot.disconnect();

  app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok' }));
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });
  await initializeErrorHandling(app);
  await compositionRoot.registerRoutes(app);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = address;
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

test('HTTP route characterization against Postgres', async (t) => {
  const ids: Record<string, string> = {};

  await t.test('auth: register and login, including isolated additional registration', async () => {
    const health = await http('/health', { authenticated: false });
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: 'ok' });

    const protectedResponse = await http('/api/v1/vehicles', { authenticated: false });
    assert.equal(protectedResponse.status, 401);
    assert.equal(protectedResponse.body.message, 'Missing or invalid Authorization header');

    const paddedRegistration = await http('/api/v1/auth/register', {
      method: 'POST',
      authenticated: false,
      body: { email: ' Driver@Example.com ', password: 'current-password' },
    });
    assert.equal(paddedRegistration.status, 400);
    assert.equal(paddedRegistration.body.code, 'VALIDATION_ERROR');

    const registration = await http('/api/v1/auth/register', {
      method: 'POST',
      authenticated: false,
      body: { email: 'Driver@Example.com', password: 'current-password' },
    });
    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.email, 'driver@example.com');
    assert.equal(typeof registration.body.token, 'string');
    userId = registration.body.user.id;
    token = registration.body.token;

    const secondRegistration = await http('/api/v1/auth/register', {
      method: 'POST',
      authenticated: false,
      body: { email: 'second@example.com', password: 'current-password' },
    });
    assert.equal(secondRegistration.status, 201);
    secondToken = secondRegistration.body.token;

    const wrongPassword = await http('/api/v1/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'driver@example.com', password: 'wrong-password' },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.message, 'Invalid email or password');

    const login = await http('/api/v1/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'DRIVER@example.com', password: 'current-password' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, userId);
    token = login.body.token;
  });

  await t.test('tracking: provisioned mobile ingest, position queries, device CRUD, commands, and raw log', async () => {
    const mobileImei = `movara-mobile-${userId}-road-phone`;
    const provisionedMobile = await json('POST', '/api/v1/devices', { imei: mobileImei, name: 'Road Phone' });
    assert.equal(provisionedMobile.status, 201);
    ids.device = provisionedMobile.body.device.id;
    ids.deviceImei = mobileImei;
    const provisionedBackground = await json('POST', '/api/v1/devices', { imei: 'osmand-background-phone', name: 'Background phone' });
    assert.equal(provisionedBackground.status, 201);
    const points = [
      ['2026-07-01T00:00:00.000Z', 12.9716, 77.5946, 12],
      ['2026-07-01T00:10:00.000Z', 12.9726, 77.5956, 18],
      ['2026-07-01T01:00:00.000Z', 12.9826, 77.6056, 22],
    ] as const;
    for (const [timestamp, latitude, longitude, speed] of points) {
      const created = await json('POST', '/api/v1/mobile/positions', {
        deviceLabel: 'Road Phone',
        timestamp,
        latitude,
        longitude,
        speed,
        accuracy: 4,
        batteryLevel: 80,
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.position.timestamp, timestamp);
      assert.equal(created.body.position.deviceId, ids.device);
    }

    const trackerState = await json('POST', '/api/v1/mobile/tracker-state', {
      deviceLabel: 'background-phone',
      active: true,
    });
    assert.equal(trackerState.status, 200);
    assert.equal(trackerState.body.device.protocol, 'osmand');
    assert.equal(trackerState.body.device.status, 'online');

    const devices = await http('/api/v1/devices?limit=20');
    assert.equal(devices.status, 200);
    assert.equal(devices.body.pagination.total, 2);
    const mobileDevice = devices.body.data.find((device: any) => device.id === ids.device);
    assert.ok(mobileDevice);
    ids.deviceImei = mobileDevice.imei;
    assert.equal(mobileDevice.imei, `movara-mobile-${userId}-road-phone`);

    const updated = await json('PATCH', `/api/v1/devices/${ids.device}`, { name: 'Primary tracker' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.device.name, 'Primary tracker');

    const latest = await http(`/api/v1/positions/latest?deviceId=${ids.device}&limit=2`);
    assert.equal(latest.status, 200);
    assert.equal(latest.body.positions.length, 2);
    assert.equal(latest.body.positions[0].timestamp, '2026-07-01T01:00:00.000Z');

    const stats = await http(
      `/api/v1/positions/stats?deviceId=${ids.device}&from=2026-07-01T00:00:00.000Z&to=2026-07-01T02:00:00.000Z`,
    );
    assert.equal(stats.status, 200);
    assert.equal(stats.body.pointCount, 3);
    assert.equal(stats.body.positions[0].timestamp, '2026-07-01T01:00:00.000Z');

    // Protocol identity normally comes from a live TCP session. Persist the same
    // state a protocol handler would write before exercising command routes.
    await deviceStateStore!.updateProtocol(ids.deviceImei, 'gt06');
    const available = await http(`/api/v1/devices/${ids.device}/commands/available`);
    assert.equal(available.status, 200);
    assert.equal(available.body.protocol, 'gt06');
    assert.equal(available.body.commandConnected, false);
    assert.deepEqual(available.body.commands.map((command: any) => command.key), ['gt06_custom']);

    const sent = await json('POST', `/api/v1/devices/${ids.device}/commands`, {
      commandKey: 'gt06_custom',
      values: { content: 'STATUS#' },
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.command.status, 'pending');
    assert.equal(sent.body.command.content, 'STATUS#');

    const history = await http(`/api/v1/devices/${ids.device}/commands`);
    assert.equal(history.status, 200);
    assert.equal(history.body.commands.length, 1);
    assert.equal(history.body.commands[0].id, sent.body.command.id);

    const { PrismaClient } = await import('@prisma/client');
    const { DeviceStateStore } = await import('../../src/modules/tracking/infrastructure/device/DeviceStateStore');
    const { DeviceCommandStore } = await import('../../src/modules/tracking/infrastructure/device/DeviceCommandStore');
    const { PrismaRawLogStore } = await import('../../src/modules/tracking/infrastructure/persistence/PrismaRawLogStore');
    const restartedPrisma = new PrismaClient();
    try {
      const reloadedState = await new DeviceStateStore(restartedPrisma).getSnapshot(ids.deviceImei);
      assert.equal(reloadedState.protocol, 'gt06');
      assert.ok(reloadedState.lastSeen);
      const reloadedCommands = await new DeviceCommandStore(restartedPrisma).listByDevice(ids.device, 5);
      assert.equal(reloadedCommands[0].id, sent.body.command.id);
      assert.equal(reloadedCommands[0].status, 'pending');
      await new PrismaRawLogStore(restartedPrisma).push({
        port: 5023,
        raw: '78 78',
        kind: 'packet',
        remoteAddress: '127.0.0.1:1234',
      });
    } finally {
      await restartedPrisma.$disconnect();
    }

    const rawLog = await http('/api/v1/raw-log?limit=5');
    assert.equal(rawLog.status, 200);
    assert.equal(rawLog.body.entries.length, 1);
    assert.equal(rawLog.body.entries[0].raw, '78 78');
    const clearedRawLog = await http('/api/v1/raw-log', { method: 'DELETE' });
    assert.equal(clearedRawLog.status, 204);

    const disposable = devices.body.data.find((device: any) => device.id !== ids.device);
    const deleted = await http(`/api/v1/devices/${disposable.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
  });

  await t.test('vehicles: CRUD, photos, fuel records, derived trips, and merge markers', async () => {
    const created = await json('POST', '/api/v1/vehicles', {
      name: 'Current Car',
      description: '',
      currentOdometer: 12000,
      fuelType: 'petrol',
      deviceId: ids.device,
    });
    assert.equal(created.status, 201);
    ids.vehicle = created.body.vehicle.id;
    assert.equal(created.body.vehicle.description, null);
    assert.equal(created.body.vehicle.estimatedOdometerKm, 12000);

    const listed = await http('/api/v1/vehicles?page=1&limit=10');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.pagination.total, 1);

    const fetched = await http(`/api/v1/vehicles/${ids.vehicle}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.vehicle.name, 'Current Car');

    const updated = await json('PATCH', `/api/v1/vehicles/${ids.vehicle}`, {
      name: 'Current Car Updated',
      thirdPartyInsuranceEnd: '2027-07-01T00:00:00.000Z',
      thirdPartyInsuranceProvider: 'Current Insurer',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.vehicle.thirdPartyInsuranceProvider, 'Current Insurer');
    assert.equal(updated.body.vehicle.thirdPartyInsuranceEnd, '2027-07-01T00:00:00.000Z');

    const photoBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const photoUpload = await http(`/api/v1/vehicles/${ids.vehicle}/photo`, {
      method: 'POST',
      form: multipartFile('car.png', photoBytes, 'image/png'),
    });
    assert.equal(photoUpload.status, 200);
    assert.match(photoUpload.body.vehicle.photoPath, /^vehicles\//);
    const photo = await http(`/api/v1/vehicles/${ids.vehicle}/photo`);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    assert.deepEqual(photo.bytes, photoBytes);

    const fuel = await json('POST', `/api/v1/vehicles/${ids.vehicle}/fuel-records`, {
      date: '2026-07-01T01:30:00.000Z',
      odometer: 12125,
      fuelQuantity: 20.5,
      fuelCost: 2100,
    });
    assert.equal(fuel.status, 201);
    ids.fuel = fuel.body.fuelRecord.id;
    assert.equal(fuel.body.fuelRecord.latitude, 12.9826);
    assert.equal(fuel.body.fuelRecord.longitude, 77.6056);

    const fuelList = await http(`/api/v1/vehicles/${ids.vehicle}/fuel-records`);
    assert.equal(fuelList.status, 200);
    assert.equal(fuelList.body.fuelRecords.length, 1);

    const fuelUpdate = await json('PATCH', `/api/v1/vehicles/${ids.vehicle}/fuel-records/${ids.fuel}`, {
      fuelQuantity: 21,
      fuelRate: 100,
    });
    assert.equal(fuelUpdate.status, 200);
    assert.equal(fuelUpdate.body.fuelRecord.fuelQuantity, 21);
    assert.equal(fuelUpdate.body.fuelRecord.fuelRate, 100);

    const derivedTrips = await http(
      `/api/v1/vehicles/${ids.vehicle}/trips?from=2026-07-01T00:00:00.000Z&to=2026-07-01T02:00:00.000Z`,
    );
    assert.equal(derivedTrips.status, 200);
    assert.equal(derivedTrips.body.trips.length, 2);

    const mergeMarker = await json('POST', `/api/v1/vehicles/${ids.vehicle}/trip-merges`, {
      gapAfter: '2026-07-01T00:10:00.000Z',
      gapBefore: '2026-07-01T01:00:00.000Z',
    });
    assert.equal(mergeMarker.status, 201);
    const mergeMarkers = await http(`/api/v1/vehicles/${ids.vehicle}/trip-merges`);
    assert.equal(mergeMarkers.status, 200);
    assert.equal(mergeMarkers.body.tripMerges.length, 1);
    const mergedDerivedTrips = await http(
      `/api/v1/vehicles/${ids.vehicle}/trips?from=2026-07-01T00:00:00.000Z&to=2026-07-01T02:00:00.000Z`,
    );
    assert.equal(mergedDerivedTrips.body.trips.length, 1);
    const removedMarker = await http(
      `/api/v1/vehicles/${ids.vehicle}/trip-merges?gapAfter=${encodeURIComponent('2026-07-01T00:10:00.000Z')}&gapBefore=${encodeURIComponent('2026-07-01T01:00:00.000Z')}`,
      { method: 'DELETE' },
    );
    assert.equal(removedMarker.status, 204);

    const fuelDelete = await http(`/api/v1/vehicles/${ids.vehicle}/fuel-records/${ids.fuel}`, { method: 'DELETE' });
    assert.equal(fuelDelete.status, 204);

    const disposable = await json('POST', '/api/v1/vehicles', { name: 'Delete Me' });
    assert.equal(disposable.status, 201);
    const vehicleDelete = await http(`/api/v1/vehicles/${disposable.body.vehicle.id}`, { method: 'DELETE' });
    assert.equal(vehicleDelete.status, 204);
    const missing = await http(`/api/v1/vehicles/${disposable.body.vehicle.id}`);
    assert.equal(missing.status, 404);
  });

  await t.test('maintenance: unified records, legacy maintenance CRUD, and both attachment route families', async () => {
    const generic = await json('POST', '/api/v1/vehicle-records', {
      vehicleId: ids.vehicle,
      type: 'document',
      subtype: 'registration',
      title: 'Registration certificate',
      date: '2026-06-01T00:00:00.000Z',
      reminderMode: 'on_date',
      validUntil: '2027-06-01T00:00:00.000Z',
    });
    assert.equal(generic.status, 201);
    ids.genericRecord = generic.body.record.id;

    const genericList = await http(`/api/v1/vehicle-records?vehicleId=${ids.vehicle}&type=document`);
    assert.equal(genericList.status, 200);
    assert.equal(genericList.body.pagination.total, 2); // includes insurance created by vehicle PATCH

    const genericUpdate = await json('PATCH', `/api/v1/vehicle-records/${ids.genericRecord}`, {
      title: 'Updated registration certificate',
      amount: '450',
    });
    assert.equal(genericUpdate.status, 200);
    assert.equal(genericUpdate.body.record.amount, 450);

    const attachmentBytes = Buffer.from('%PDF-current-behavior');
    const attachmentUpload = await http(`/api/v1/vehicle-records/${ids.genericRecord}/attachment`, {
      method: 'POST',
      form: multipartFile('registration.pdf', attachmentBytes, 'application/pdf'),
    });
    assert.equal(attachmentUpload.status, 200);
    const attachment = await http(`/api/v1/vehicle-records/${ids.genericRecord}/attachment`);
    assert.equal(attachment.status, 200);
    assert.equal(attachment.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(attachment.bytes, attachmentBytes);

    const maintenance = await json('POST', '/api/v1/maintenance', {
      vehicleId: ids.vehicle,
      type: 'service',
      date: '2026-07-15T00:00:00.000Z',
      notes: 'Initial service',
      odometer: 12200,
      cost: 3500,
    });
    assert.equal(maintenance.status, 201);
    ids.maintenance = maintenance.body.record.id;
    assert.equal(maintenance.body.record.type, 'service');
    assert.equal(maintenance.body.record.cost, 3500);

    const allMaintenance = await http('/api/v1/maintenance?page=1&limit=10');
    assert.equal(allMaintenance.status, 200);
    assert.equal(allMaintenance.body.pagination.total, 1);
    const vehicleMaintenance = await http(`/api/v1/maintenance/${ids.vehicle}`);
    assert.equal(vehicleMaintenance.status, 200);
    assert.equal(vehicleMaintenance.body.data.length, 1);

    const maintenanceUpdate = await json('PATCH', `/api/v1/maintenance/${ids.maintenance}`, {
      type: 'repair',
      notes: 'Current repair behavior',
      cost: 4000,
    });
    assert.equal(maintenanceUpdate.status, 200);
    assert.equal(maintenanceUpdate.body.record.type, 'repair');

    const receiptBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const receiptUpload = await http(`/api/v1/maintenance/${ids.maintenance}/receipt`, {
      method: 'POST',
      form: multipartFile('receipt.jpg', receiptBytes, 'image/jpeg'),
    });
    assert.equal(receiptUpload.status, 200);
    const receipt = await http(`/api/v1/maintenance/${ids.maintenance}/receipt`);
    assert.equal(receipt.status, 200);
    assert.equal(receipt.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(receipt.bytes, receiptBytes);

    const maintenanceDelete = await http(`/api/v1/maintenance/${ids.maintenance}`, { method: 'DELETE' });
    assert.equal(maintenanceDelete.status, 204);
    const genericDelete = await http(`/api/v1/vehicle-records/${ids.genericRecord}`, { method: 'DELETE' });
    assert.equal(genericDelete.status, 204);
  });

  await t.test('trips: CRUD, stops, split/merge, GPX import, fusion candidates, and fuse', async () => {
    const created = await json('POST', '/api/v1/trips', {
      deviceId: ids.device,
      vehicleId: ids.vehicle,
      startTime: '2026-07-01T00:00:00.000Z',
      endTime: '2026-07-01T01:00:00.000Z',
      name: 'Device trip',
      favorite: false,
    });
    assert.equal(created.status, 201);
    ids.trip = created.body.trip.id;

    const list = await http(`/api/v1/trips?vehicleId=${ids.vehicle}&page=1&limit=20`);
    assert.equal(list.status, 200);
    assert.equal(list.body.pagination.total, 1);

    const detail = await http(`/api/v1/trips/${ids.trip}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.stats.pointCount, 3);

    const updated = await json('PATCH', `/api/v1/trips/${ids.trip}`, {
      name: 'Updated device trip',
      favorite: true,
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.trip.favorite, true);

    const stop = await json('POST', `/api/v1/trips/${ids.trip}/stops`, {
      label: 'Coffee',
      startTime: '2026-07-01T00:20:00.000Z',
      endTime: '2026-07-01T00:25:00.000Z',
      latitude: 12.975,
      longitude: 77.598,
    });
    assert.equal(stop.status, 201);
    ids.stop = stop.body.stop.id;
    const stopUpdate = await json('PATCH', `/api/v1/trips/${ids.trip}/stops/${ids.stop}`, {
      label: 'Tea',
      endTime: null,
    });
    assert.equal(stopUpdate.status, 200);
    assert.equal(stopUpdate.body.stop.endTime, null);
    const stopDelete = await http(`/api/v1/trips/${ids.trip}/stops/${ids.stop}`, { method: 'DELETE' });
    assert.equal(stopDelete.status, 204);

    const split = await json('POST', `/api/v1/trips/${ids.trip}/split`, {
      splitAt: '2026-07-01T00:30:00.000Z',
    });
    assert.equal(split.status, 201);
    assert.equal(split.body.trips.length, 2);
    const merged = await json('POST', `/api/v1/trips/${split.body.trips[0].id}/merge`, {
      targetTripId: split.body.trips[1].id,
    });
    assert.equal(merged.status, 201);
    assert.deepEqual(merged.body.deletedTripIds, [split.body.trips[0].id, split.body.trips[1].id]);
    const mergedDelete = await http(`/api/v1/trips/${merged.body.mergedTripId}`, { method: 'DELETE' });
    assert.equal(mergedDelete.status, 204);

    const gpx = (offset: number, name: string) => `<?xml version="1.0"?><gpx version="1.1"><trk><name>${name}</name><trkseg>
      <trkpt lat="${12.9716 + offset}" lon="${77.5946 + offset}"><time>2026-07-02T00:00:00Z</time></trkpt>
      <trkpt lat="${12.9720 + offset}" lon="${77.5950 + offset}"><time>2026-07-02T00:05:00Z</time></trkpt>
      <trkpt lat="${12.9725 + offset}" lon="${77.5955 + offset}"><time>2026-07-02T00:10:00Z</time></trkpt>
      <trkpt lat="${12.9730 + offset}" lon="${77.5960 + offset}"><time>2026-07-02T00:15:00Z</time></trkpt>
    </trkseg></trk></gpx>`;

    const importedA = await http(`/api/v1/trips/import-gpx?vehicleId=${ids.vehicle}&name=Phone%20A`, {
      method: 'POST',
      form: multipartFile('phone-a.gpx', gpx(0, 'Phone A'), 'application/gpx+xml'),
    });
    assert.equal(importedA.status, 201);
    ids.importedA = importedA.body.trip.id;
    assert.equal(importedA.body.pointCount, undefined);
    const importedDetail = await http(`/api/v1/trips/${ids.importedA}`);
    assert.equal(importedDetail.status, 200);
    assert.equal(importedDetail.body.stats.pointCount, 4);

    const importedB = await http(`/api/v1/trips/import-gpx?vehicleId=${ids.vehicle}&name=Phone%20B`, {
      method: 'POST',
      form: multipartFile('phone-b.gpx', gpx(0.00005, 'Phone B'), 'application/gpx+xml'),
    });
    assert.equal(importedB.status, 201);
    ids.importedB = importedB.body.trip.id;

    const candidates = await http(`/api/v1/trips/${ids.importedA}/fusion-candidates`);
    assert.equal(candidates.status, 200);
    const candidate = candidates.body.candidates.find((item: any) => item.trip.id === ids.importedB);
    assert.ok(candidate);
    assert.equal(candidate.confidence, 'high');

    const fused = await json('POST', `/api/v1/trips/${ids.importedA}/fuse`, {
      targetTripId: ids.importedB,
      primaryTripId: ids.importedA,
      gapThresholdMinutes: 5,
      name: 'Fused current trip',
    });
    assert.equal(fused.status, 201);
    ids.fused = fused.body.fusedTripId;
    assert.equal(fused.body.trip.source, 'imported');
    assert.equal(fused.body.evaluation.confidence, 'high');

    const fusedDetail = await http(`/api/v1/trips/${ids.fused}`);
    assert.equal(fusedDetail.status, 200);
    assert.equal(fusedDetail.body.stats.pointCount, fused.body.pointCount);
    const fusedDelete = await http(`/api/v1/trips/${ids.fused}`, { method: 'DELETE' });
    assert.equal(fusedDelete.status, 204);
  });

  await t.test('multi-tenant ownership: foreign resources and device commands are inaccessible', async () => {
    const secondDevices = await http('/api/v1/devices?limit=20', { token: secondToken });
    assert.equal(secondDevices.status, 200);
    assert.equal(secondDevices.body.pagination.total, 0);
    const secondVehicles = await http('/api/v1/vehicles', { token: secondToken });
    assert.equal(secondVehicles.body.pagination.total, 0);
    const secondTrips = await http('/api/v1/trips', { token: secondToken });
    assert.equal(secondTrips.body.pagination.total, 0);

    assert.equal((await http(`/api/v1/vehicles/${ids.vehicle}`, { token: secondToken })).status, 404);
    assert.equal((await http(`/api/v1/trips/${ids.importedA}`, { token: secondToken })).status, 404);
    assert.equal((await http(`/api/v1/positions/latest?deviceId=${ids.device}`, { token: secondToken })).status, 404);
    assert.equal((await http(`/api/v1/vehicles/${ids.vehicle}/fuel-records`, { token: secondToken })).status, 404);
    const foreignMaintenance = await http('/api/v1/maintenance', {
      method: 'POST', token: secondToken,
      body: { vehicleId: ids.vehicle, type: 'service', date: '2026-08-01T00:00:00.000Z' },
    });
    assert.equal(foreignMaintenance.status, 404);
    await deviceStateStore!.updateProtocol(ids.deviceImei, 'eelink');
    const foreignCommand = await http(`/api/v1/devices/${ids.device}/commands`, {
      method: 'POST', token: secondToken, body: { commandKey: 'eelink_relay_enable', values: {} },
    });
    assert.equal(foreignCommand.status, 404);
    const foreignSystemAccess = await http('/api/v1/system/backup', {
      method: 'POST', token: secondToken, admin: false, body: {},
    });
    assert.equal(foreignSystemAccess.status, 403);

    const ownedVehicle = await http('/api/v1/vehicles', {
      method: 'POST', token: secondToken, body: { name: 'Second tenant car' },
    });
    assert.equal(ownedVehicle.status, 201);
    assert.equal((await http('/api/v1/vehicles')).body.pagination.total, 1);
    assert.equal((await http('/api/v1/vehicles', { token: secondToken })).body.pagination.total, 1);
  });

  await t.test('saved locations: CRUD is persisted through Postgres', async () => {
    const created = await json('POST', '/api/v1/locations', {
      name: 'Home',
      latitude: 12.9716,
      longitude: 77.5946,
      notes: 'Current behavior',
    });
    assert.equal(created.status, 201);
    ids.location = created.body.location.id;

    const listed = await http('/api/v1/locations');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.locations.some((location: any) => location.id === ids.location), true);

    const updated = await json('PATCH', `/api/v1/locations/${ids.location}`, {
      name: 'Home Updated',
      notes: null,
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.location.name, 'Home Updated');
    assert.equal(updated.body.location.notes, null);

    const deleted = await http(`/api/v1/locations/${ids.location}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    const afterDelete = await http('/api/v1/locations');
    assert.equal(afterDelete.body.locations.some((location: any) => location.id === ids.location), false);
  });

  await t.test('system: snapshot, runtime settings, and log file routes', async () => {
    const snapshot = await http('/api/v1/home-assistant/snapshot');
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.devices.length, 1);
    assert.equal(snapshot.body.vehicles.length, 1);
    assert.equal(snapshot.body.vehicles[0].id, ids.vehicle);

    const initialSettings = await http('/api/v1/system/runtime-settings');
    assert.equal(initialSettings.status, 200);
    assert.equal(initialSettings.body.settings.appLogLevel, 'silent');

    const logDir = path.join(scratchDir, 'route-logs');
    const settings = await json('POST', '/api/v1/system/runtime-settings', {
      protocolDebugDir: logDir,
      protocolLogLevel: 'debug',
      appLogLevel: 'silent',
      autoStopMinDurationMinutes: 7,
      autoStopMoveThresholdMeters: 75,
      autoStopMinPoints: 4,
    });
    assert.equal(settings.status, 200);
    assert.equal(settings.body.settings.autoStopMinDurationMinutes, 7);
    await mkdir(logDir, { recursive: true });
    const logName = 'gt06-2026-08-01.jsonl';
    const logContent = '{"current":true}\n';
    await writeFile(path.join(logDir, logName), logContent, 'utf8');

    const logs = await http('/api/v1/system/logs');
    assert.equal(logs.status, 200);
    assert.deepEqual(logs.body.files.map((file: any) => file.name), [logName]);
    const content = await http(`/api/v1/system/logs/content?name=${logName}`);
    assert.equal(content.status, 200);
    assert.equal(content.body, logContent);
    const preview = await http(`/api/v1/system/logs/preview?name=${logName}&maxBytes=1024`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.content, logContent);
    const download = await http(`/api/v1/system/logs/download?name=${logName}`);
    assert.equal(download.status, 200);
    assert.equal(download.body, logContent);
    const deleted = await http(`/api/v1/system/logs?name=${logName}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
  });

  await t.test('system: clear trips, backup/export/download, restore paths, and clear database', async () => {
    const clearTrips = await json('POST', '/api/v1/system/clear-trips', { includeTracking: true });
    assert.equal(clearTrips.status, 200);
    assert.equal(clearTrips.body.message, 'Trips and tracking data cleared');

    const durable = await json('POST', '/api/v1/vehicles', { name: 'Present In Backup' });
    assert.equal(durable.status, 201);
    ids.backedUpVehicle = durable.body.vehicle.id;

    const directExport = await http('/api/v1/system/backup/export', { method: 'POST' });
    assert.equal(directExport.status, 200);
    assert.equal(directExport.headers.get('content-type'), 'application/gzip');
    assert.equal(directExport.bytes[0], 0x1f);
    assert.equal(directExport.bytes[1], 0x8b);

    const backup = await json('POST', '/api/v1/system/backup', {});
    assert.equal(backup.status, 201);
    assert.equal(backup.body.status, 'success');
    const backupName = backup.body.backup.downloadPath;

    const downloaded = await http(`/api/v1/system/backup/download?path=${encodeURIComponent(backupName)}`);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('content-type'), 'application/gzip');
    assert.equal(downloaded.bytes[0], 0x1f);
    assert.equal(downloaded.bytes[1], 0x8b);

    const afterBackup = await json('POST', '/api/v1/vehicles', { name: 'Removed By Restore' });
    assert.equal(afterBackup.status, 201);
    const restore = await json('POST', '/api/v1/system/restore', { backupPath: backupName });
    assert.equal(restore.status, 200);
    assert.deepEqual(restore.body, { status: 'success', restore: { status: 'restored' } });
    const missingAfterRestore = await http(`/api/v1/vehicles/${afterBackup.body.vehicle.id}`);
    assert.equal(missingAfterRestore.status, 404);
    const restoredVehicle = await http(`/api/v1/vehicles/${ids.backedUpVehicle}`);
    assert.equal(restoredVehicle.status, 200);

    const mutateAgain = await json('POST', '/api/v1/vehicles', { name: 'Removed By Upload Restore' });
    assert.equal(mutateAgain.status, 201);
    const uploadRestore = await http('/api/v1/system/restore/upload', {
      method: 'POST',
      form: multipartFile('backup.sql.gz', downloaded.bytes, 'application/gzip'),
    });
    assert.equal(uploadRestore.status, 200);
    assert.equal(uploadRestore.body.restore.status, 'restored');
    const missingAfterUploadRestore = await http(`/api/v1/vehicles/${mutateAgain.body.vehicle.id}`);
    assert.equal(missingAfterUploadRestore.status, 404);

    const clearDatabase = await http('/api/v1/system/clear-database', { method: 'POST' });
    assert.equal(clearDatabase.status, 200);
    assert.deepEqual(clearDatabase.body, { status: 'success', message: 'Database cleared' });
    const emptyVehicles = await http('/api/v1/vehicles');
    assert.equal(emptyVehicles.status, 200);
    assert.equal(emptyVehicles.body.pagination.total, 0);
    const loginAfterClear = await http('/api/v1/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'driver@example.com', password: 'current-password' },
    });
    assert.equal(loginAfterClear.status, 401);
  });
});
