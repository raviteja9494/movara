import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceStateStore } from '../src/modules/tracking/infrastructure/device/DeviceStateStore';

test('device state writes are throttled and pending values flush', async () => {
  let clock = new Date('2026-10-26T10:00:00.000Z');
  const row = {
    id: 'device-1', userId: 'user-1', imei: 'imei-1', lastSeen: null as Date | null,
    status: 'offline', statusUpdatedAt: null as Date | null, protocol: 'unknown', lastAttributes: null as object | null,
  };
  const writes: Array<Record<string, unknown>> = [];
  const prisma = {
    device: {
      findUnique: async () => ({ ...row }),
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); Object.assign(row, data); return row; },
      updateMany: async () => ({ count: 1 }),
    },
  } as never;
  const store = new DeviceStateStore(prisma, () => clock);

  await store.updateLastSeen('imei-1', clock);
  assert.equal(writes.length, 1, 'first packet writes immediately');
  clock = new Date(clock.getTime() + 10_000);
  await store.updateLastSeen('imei-1', clock);
  assert.equal(writes.length, 1, 'lastSeen is throttled inside 30 seconds');
  assert.equal((await store.getLastSeen('imei-1'))?.getTime(), clock.getTime(), 'reads use current in-memory state');
  await store.flush();
  assert.equal(writes.length, 2, 'flush persists pending lastSeen');
  clock = new Date(clock.getTime() + 30_000);
  await store.updateLastSeen('imei-1', clock);
  assert.equal(writes.length, 3, 'lastSeen writes after 30 seconds');

  await store.updateLastAttributes('imei-1', { ignition: true });
  assert.equal(writes.length, 4, 'changed attributes write immediately');
  await store.updateLastAttributes('imei-1', { ignition: true });
  assert.equal(writes.length, 4, 'unchanged attributes do not write');
  await store.updateLastAttributes('imei-1', { ignition: true, voltage: 12 });
  assert.equal(writes.length, 5, 'merged attribute change writes immediately');

  clock = new Date(clock.getTime() + 61_000);
  await store.updateLastAttributes('imei-1', { ignition: true, voltage: 12 });
  assert.equal(writes.length, 6, 'unchanged attributes refresh after 60 seconds');
});
