import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildAck } from '../src/modules/tracking/infrastructure/protocols/gt06/Gt06Acker';
import { Gt06Protocol } from '../src/modules/tracking/infrastructure/protocols/gt06/Gt06Protocol';
import { EelinkProtocol } from '../src/modules/tracking/infrastructure/protocols/eelink/EelinkProtocol';
import { getDailyLogPath } from '../src/shared/logging/LogFileManager';
import { runtimeSettingsStore, type ProtocolLogLevel, type RuntimeSettings } from '../src/shared/runtimeSettings/RuntimeSettingsStore';

const loggedLevels: ProtocolLogLevel[] = ['warn', 'info', 'debug', 'trace', 'raw'];

function setProtocolLogLevel(protocolLogLevel: ProtocolLogLevel, protocolDebugDir: string): void {
  (runtimeSettingsStore as unknown as { cache: RuntimeSettings | null }).cache = {
    protocolDebugEnabled: protocolLogLevel !== 'silent',
    protocolDebugDir,
    protocolLogLevel,
    appLogLevel: 'silent',
    autoStopMinDurationMinutes: 3,
    autoStopMoveThresholdMeters: 60,
    autoStopMinPoints: 3,
  };
}

function readEntries(protocol: 'eelink' | 'gt06'): Array<Record<string, unknown>> {
  const logPath = getDailyLogPath(protocol, new Date());
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function assertFiltering(
  protocol: 'eelink' | 'gt06',
  packet: Buffer,
  handleMessage: () => Promise<Buffer | null>,
): Promise<void> {
  const originalCache = (runtimeSettingsStore as unknown as { cache: RuntimeSettings | null }).cache;
  try {
    for (const protocolLogLevel of ['silent', ...loggedLevels] as ProtocolLogLevel[]) {
      const logDirectory = await mkdtemp(path.join(os.tmpdir(), `movara-${protocol}-unknown-`));
      try {
        setProtocolLogLevel(protocolLogLevel, logDirectory);
        await handleMessage();
        const entries = readEntries(protocol);
        if (protocolLogLevel === 'silent') {
          assert.equal(entries.length, 0);
          continue;
        }
        assert.equal(entries.length, 1);
        assert.equal(entries[0].action, 'unknown');
        assert.equal(entries[0].raw, packet.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' '));
        assert.deepEqual(entries[0].details, { length: packet.length });
      } finally {
        await rm(logDirectory, { recursive: true, force: true });
      }
    }
  } finally {
    (runtimeSettingsStore as unknown as { cache: RuntimeSettings | null }).cache = originalCache;
  }
}

test('Eelink unknown packet debug entries retain raw bytes at every visible level', async () => {
  const packet = Buffer.from([0x67, 0x67, 0x09, 0x00, 0x02, 0x00, 0x01]);
  const protocol = new EelinkProtocol(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);
  await assertFiltering('eelink', packet, () => protocol.handleMessage(packet, 42));
});

test('GT06 unknown packet debug entries retain raw bytes at every visible level', async () => {
  const packet = buildAck(0x99, 1);
  const protocol = new Gt06Protocol(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);
  await assertFiltering('gt06', packet, () => protocol.handleMessage(packet, 42));
});
