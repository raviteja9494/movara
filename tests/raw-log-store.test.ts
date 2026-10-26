import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaRawLogStore } from '../src/modules/tracking/infrastructure/persistence/PrismaRawLogStore';
import { runtimeSettingsStore, type RuntimeSettings } from '../src/shared/runtimeSettings/RuntimeSettingsStore';

function setDebug(enabled: boolean): RuntimeSettings | null {
  const holder = runtimeSettingsStore as unknown as { cache: RuntimeSettings | null };
  const previous = holder.cache;
  holder.cache = {
    protocolDebugEnabled: enabled,
    protocolDebugDir: './protocol-logs',
    protocolLogLevel: enabled ? 'debug' : 'silent',
    appLogLevel: 'silent',
    autoStopMinDurationMinutes: 3,
    autoStopMoveThresholdMeters: 60,
    autoStopMinPoints: 3,
    stationaryFilter: { enabled: true, distanceMeters: 15, heartbeatSeconds: 300 },
  };
  return previous;
}

test('raw log persistence filters routine entries when debug is off and trims every 50 inserts', async () => {
  const creates: unknown[] = [];
  let trims = 0;
  const prisma = {
    rawLogEntry: {
      create: async ({ data }: { data: unknown }) => { creates.push(data); },
      findMany: async () => { trims += 1; return []; },
      deleteMany: async () => undefined,
    },
  } as never;
  const store = new PrismaRawLogStore(prisma);
  const previous = setDebug(false);
  try {
    await store.push({ port: 5023, raw: 'routine', kind: 'packet' });
    await store.push({ port: 5023, raw: 'routine socket error', kind: 'socket-error' });
    assert.equal(creates.length, 0);
    for (const kind of ['connect', 'parse-error', 'rejected', 'unknown'] as const) {
      await store.push({ port: 5023, raw: kind, kind });
    }
    assert.equal(creates.length, 4);
    assert.equal(trims, 0, 'no trim query before 50 inserts');
    for (let i = 0; i < 46; i += 1) await store.push({ port: 5023, raw: 'connection', kind: 'connect' });
    assert.equal(creates.length, 50);
    assert.equal(trims, 1, 'trim query runs on the 50th inserted row');

    setDebug(true);
    await store.push({ port: 5023, raw: 'debug packet', kind: 'packet' });
    assert.equal(creates.length, 51, 'debug mode persists routine packets');
    assert.equal(trims, 1);
  } finally {
    (runtimeSettingsStore as unknown as { cache: RuntimeSettings | null }).cache = previous;
  }
});
