import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Device, Position } from '../src/modules/tracking/domain/entities';
import type { DeviceRepository, PositionRepository } from '../src/modules/tracking/domain/repositories';
import { ProcessIncomingPositionUseCase } from '../src/modules/tracking/application/use-cases/ProcessIncomingPositionUseCase';
import type { DeviceStateStore } from '../src/modules/tracking/infrastructure/device/DeviceStateStore';
import type { StationaryFilterSettings } from '../src/shared/runtimeSettings/RuntimeSettingsStore';

const defaults: StationaryFilterSettings = { enabled: true, distanceMeters: 15, heartbeatSeconds: 300 };
const device = new Device('device-id', 'user-id', 'tracker-imei', 'Tracker', null, new Date());

function makePosition(timestamp: Date, attributes: Record<string, unknown> | null = null): Position {
  return new Position('stored-position', 'user-id', 'device-id', timestamp, 0, 0, 0, timestamp, attributes);
}

async function processPoint(options: {
  last?: Position;
  timestamp?: Date;
  latitude?: number;
  longitude?: number;
  speed?: number;
  attributes?: Record<string, unknown> | null;
  filter?: StationaryFilterSettings;
} = {}) {
  const saved: Position[] = [];
  const stateUpdates: string[] = [];
  const positionRepository = {
    findByDeviceId: async () => options.last ? [options.last] : [],
    save: async (position: Position) => {
      saved.push(position);
      return position;
    },
  } as unknown as PositionRepository;
  const deviceRepository = {
    findByImei: async () => device,
  } as unknown as DeviceRepository;
  const deviceStateStore = {
    updateLastSeen: async () => { stateUpdates.push('lastSeen'); },
    setStatus: async () => { stateUpdates.push('status'); },
    updateLastAttributes: async () => { stateUpdates.push('attributes'); },
  } as unknown as DeviceStateStore;
  const useCase = new ProcessIncomingPositionUseCase(
    positionRepository,
    deviceRepository,
    deviceStateStore,
    () => options.filter ?? defaults,
  );
  const timestamp = options.timestamp ?? new Date(Date.now() - 60_000);
  const result = await useCase.execute({
    deviceId: device.imei,
    receivedAt: new Date(),
    timestamp,
    latitude: options.latitude ?? 0,
    longitude: options.longitude ?? 0,
    speed: options.speed,
    attributes: options.attributes,
  });
  return { result, saved, stateUpdates };
}

test('stationary filtering stores the first point and points beyond the distance limit', async () => {
  const first = await processPoint();
  assert.equal(first.saved.length, 1);

  const last = makePosition(new Date(Date.now() - 120_000));
  const moved = await processPoint({ last, timestamp: new Date(last.timestamp.getTime() + 60_000), latitude: 0.0003 });
  assert.equal(moved.saved.length, 1);
});

test('stationary filtering suppresses a slow nearby point but still updates device state', async () => {
  const last = makePosition(new Date(Date.now() - 600_000), { ignition: false });
  const result = await processPoint({ last, timestamp: new Date(last.timestamp.getTime() + 60_000), attributes: { ignition: false } });

  assert.equal(result.saved.length, 0);
  assert.equal(result.result, last);
  assert.deepEqual(result.stateUpdates, ['lastSeen', 'attributes']);
});

test('stationary filtering stores the heartbeat point', async () => {
  const last = makePosition(new Date(Date.now() - 600_000));
  const result = await processPoint({ last, timestamp: new Date(last.timestamp.getTime() + 300_000) });
  assert.equal(result.saved.length, 1);
});

test('ignition, ACC, and tracker-active changes are always stored, including fast duplicates', async () => {
  for (const key of ['ignition', 'gt06_status_acc_on', 'tracker_active']) {
    const last = makePosition(new Date(Date.now() - 60_000), { [key]: false });
    const result = await processPoint({
      last,
      timestamp: new Date(last.timestamp.getTime() + 1000),
      attributes: { [key]: true },
    });
    assert.equal(result.saved.length, 1, `${key} transition should be persisted`);
  }
});

test('out-of-order points are always stored, even when otherwise duplicate', async () => {
  const last = makePosition(new Date(Date.now() - 60_000));
  const result = await processPoint({ last, timestamp: new Date(last.timestamp.getTime() - 1000) });
  assert.equal(result.saved.length, 1);
});

test('high reported speed is stored even at the same location', async () => {
  const last = makePosition(new Date(Date.now() - 60_000));
  const result = await processPoint({ last, timestamp: new Date(last.timestamp.getTime() + 1000), speed: 3 });
  assert.equal(result.saved.length, 1);
});

test('disabling the stationary filter preserves the older narrow deduplication behavior', async () => {
  const last = makePosition(new Date(Date.now() - 600_000));
  const result = await processPoint({
    last,
    timestamp: new Date(last.timestamp.getTime() + 60_000),
    latitude: 0.00005,
    filter: { ...defaults, enabled: false },
  });
  assert.equal(result.saved.length, 1);
});
