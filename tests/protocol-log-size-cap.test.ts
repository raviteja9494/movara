import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { appendDailyLog, deleteLogFile, getDailyLogPath } from '../src/shared/logging/LogFileManager';

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

test('deleting or pruning a capped daily log clears its bookkeeping', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movara-protocol-log-cleanup-'));
  const previousDir = process.env.PROTOCOL_DEBUG_DIR;
  const previousCap = process.env.PROTOCOL_LOG_MAX_FILE_MB;
  const RealDate = Date;
  let fixedTime = new RealDate('2026-01-01T12:00:00Z').getTime();
  class ControlledDate extends RealDate {
    constructor(value?: string | number) {
      super(value ?? fixedTime);
    }

    static now(): number {
      return fixedTime;
    }
  }
  process.env.PROTOCOL_DEBUG_DIR = dir;
  process.env.PROTOCOL_LOG_MAX_FILE_MB = '1';
  globalThis.Date = ControlledDate;

  try {
    const days = Array.from({ length: 5 }, (_, index) => new RealDate(Date.UTC(2026, 0, index + 1, 12)));
    const prunedLogPath = getDailyLogPath('app', days[0]);
    for (let index = 0; index < days.length; index += 1) {
      fixedTime = days[index].getTime();
      appendDailyLog('app', index === 0 ? 'x'.repeat(1024 * 1024 - 1) : `day ${index + 1}`);
    }

    assert.equal(fs.existsSync(prunedLogPath), false);
    fs.unlinkSync(getDailyLogPath('app', days[1]));
    fixedTime = days[0].getTime();
    appendDailyLog('app', 'recreated after retention pruning');
    assert.equal(fs.readFileSync(prunedLogPath, 'utf8'), 'recreated after retention pruning\n');

    const deletedLogPath = getDailyLogPath('eelink', days[0]);
    appendDailyLog('eelink', 'x'.repeat(1024 * 1024 - 1));
    deleteLogFile(path.basename(deletedLogPath));
    appendDailyLog('eelink', 'recreated after deletion');
    assert.equal(fs.readFileSync(deletedLogPath, 'utf8'), 'recreated after deletion\n');
  } finally {
    globalThis.Date = RealDate;
    if (previousDir === undefined) delete process.env.PROTOCOL_DEBUG_DIR;
    else process.env.PROTOCOL_DEBUG_DIR = previousDir;
    if (previousCap === undefined) delete process.env.PROTOCOL_LOG_MAX_FILE_MB;
    else process.env.PROTOCOL_LOG_MAX_FILE_MB = previousCap;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
