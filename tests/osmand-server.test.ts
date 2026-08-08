import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Device } from '../src/modules/tracking/domain/entities';
import { OsmAndServer } from '../src/modules/tracking/infrastructure/protocols/osmand/OsmAndServer';
import { hashOsmAndDeviceSecret } from '../src/modules/tracking/infrastructure/security/OsmAndDeviceSecret';

const persisted: unknown[] = [];
const rawLogs: Array<{ raw: string }> = [];
type OsmAndServerDependencies = ConstructorParameters<typeof OsmAndServer>;
const device = new Device(
  'device-id',
  'user-id',
  'osmand-phone',
  'Phone',
  hashOsmAndDeviceSecret('a-long-test-device-secret'),
  new Date(),
);
test('OsmAnd rejects invalid secrets and accepts Android position uploads', async () => {
  const server = new OsmAndServer(
    { execute: async (position: unknown) => { persisted.push(position); return position; } } as unknown as OsmAndServerDependencies[0],
    { findByImei: async () => device } as unknown as OsmAndServerDependencies[1],
    { updateProtocol: async () => undefined, updateLastAttributes: async () => undefined, setStatus: async () => undefined } as unknown as OsmAndServerDependencies[2],
    { push: async (entry: { raw: string }) => { rawLogs.push(entry); } } as unknown as OsmAndServerDependencies[3],
    0,
    { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as OsmAndServerDependencies[5],
  );
  await server.start();
  try {
    const port = server.getListeningPort();
    assert.ok(port);
    const baseUrl = `http://127.0.0.1:${port}`;
    const rejected = await fetch(`${baseUrl}/?id=phone&lat=12.97&lon=77.59&token=wrong-secret`);
    assert.equal(rejected.status, 401);
    assert.equal(persisted.length, 0);

    const androidUpload = new URL(baseUrl);
    androidUpload.search = new URLSearchParams({
      token: 'a-long-test-device-secret',
      id: 'phone',
      lat: '12.9716',
      lon: '77.5946',
      timestamp: '2026-08-08T10:30:00.000Z',
      speed: '12.5',
      accuracy: '4.0',
      source: 'movara_android',
      trackerActive: 'true',
    }).toString();
    const accepted = await fetch(androidUpload);
    assert.equal(accepted.status, 200);
    assert.equal(await accepted.text(), 'OK');
    assert.equal(persisted.length, 1);
    const uploadedPosition = persisted[0] as {
      deviceId: string;
      latitude: number;
      longitude: number;
      timestamp: Date;
      speed: number;
      attributes: Record<string, unknown>;
    };
    assert.equal(uploadedPosition.deviceId, 'osmand-phone');
    assert.equal(uploadedPosition.latitude, 12.9716);
    assert.equal(uploadedPosition.longitude, 77.5946);
    assert.equal(uploadedPosition.timestamp.toISOString(), '2026-08-08T10:30:00.000Z');
    assert.equal(uploadedPosition.speed, 12.5);
    assert.equal(uploadedPosition.attributes.accuracy, 4);
    assert.equal(uploadedPosition.attributes.source, 'movara_android');
    assert.equal(uploadedPosition.attributes.tracker_active, true);
    assert.equal(rawLogs.some((entry) => entry.raw.includes('a-long-test-device-secret')), false);
  } finally {
    await server.stop();
  }
});
