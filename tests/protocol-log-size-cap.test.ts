import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { appendDailyLog, getDailyLogPath } from '../src/shared/logging/LogFileManager';

test('daily protocol log stops at its configured file cap and warns once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movara-protocol-log-'));
  const previousDir = process.env.PROTOCOL_DEBUG_DIR;
  const previousCap = process.env.PROTOCOL_LOG_MAX_FILE_MB;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  process.env.PROTOCOL_DEBUG_DIR = dir;
  process.env.PROTOCOL_LOG_MAX_FILE_MB = '1';
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    const cappedLine = 'x'.repeat(1024 * 1024 - 1);
    appendDailyLog('app', cappedLine);
    appendDailyLog('app', 'later line');
    appendDailyLog('app', 'another later line');

    const logPath = getDailyLogPath('app', new Date());
    assert.equal(fs.statSync(logPath).size, 1024 * 1024);
    assert.equal(fs.readFileSync(logPath, 'utf8'), `${cappedLine}\n`);
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /size cap reached/);
    assert.match(String(warnings[0][0]), /app-\d{4}-\d{2}-\d{2}\.jsonl/);
  } finally {
    console.warn = originalWarn;
    if (previousDir === undefined) delete process.env.PROTOCOL_DEBUG_DIR;
    else process.env.PROTOCOL_DEBUG_DIR = previousDir;
    if (previousCap === undefined) delete process.env.PROTOCOL_LOG_MAX_FILE_MB;
    else process.env.PROTOCOL_LOG_MAX_FILE_MB = previousCap;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
