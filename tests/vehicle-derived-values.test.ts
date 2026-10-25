import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  averageFuelEconomyKmPerL,
  calculateRecordReminder,
  summarizeFuelRecords,
  type ReminderRecordForCalculation,
} from '../src/shared/vehicleDerivedValues';

function reminderRecord(overrides: Partial<ReminderRecordForCalculation> = {}): ReminderRecordForCalculation {
  return {
    id: 'record-1',
    title: 'Registration',
    type: 'document',
    subtype: 'registration',
    date: new Date(2026, 3, 1, 12),
    validUntil: null,
    reminderMode: 'none',
    reminderDaysBefore: null,
    recurringIntervalDays: null,
    odometer: null,
    recurringIntervalKm: null,
    ...overrides,
  };
}

test('fuel summary handles empty data and records with missing rate or cost', () => {
  assert.deepEqual(summarizeFuelRecords([]), {
    averageKmPerL: null,
    recordCount: 0,
    totalCost: null,
  });
  assert.equal(averageFuelEconomyKmPerL([{
    date: new Date(2026, 0, 1), odometer: 1000, fuelQuantity: 20, fuelCost: null, fuelRate: null,
  }]), null);

  const result = summarizeFuelRecords([
    { date: new Date(2026, 0, 3), odometer: 2000, fuelQuantity: 50, fuelCost: 120, fuelRate: null },
    { date: new Date(2026, 0, 1), odometer: 1000, fuelQuantity: 25, fuelCost: null, fuelRate: null },
    { date: new Date(2026, 0, 2), odometer: 1500, fuelQuantity: 40, fuelCost: null, fuelRate: null },
  ]);
  assert.equal(result.recordCount, 3);
  assert.equal(result.totalCost, 120);
  assert.ok(Math.abs(result.averageKmPerL! - (1000 / 90)) < 1e-12);
});

test('date reminders are overdue by local calendar day and due within their warning window', () => {
  const now = new Date(2026, 3, 15, 12);
  const overdue = calculateRecordReminder(reminderRecord({
    reminderMode: 'on_date',
    date: new Date(2026, 3, 1, 12),
    validUntil: new Date(2026, 3, 13, 23),
  }), null, now);
  assert.equal(overdue?.severity, 'overdue');
  assert.equal(overdue?.remainingDays, -2);
  assert.equal(overdue?.dueDate?.toISOString(), new Date(2026, 3, 13, 23).toISOString());

  const due = calculateRecordReminder(reminderRecord({
    reminderMode: 'recurring_date',
    date: new Date(2026, 3, 1, 12),
    recurringIntervalDays: 14,
    reminderDaysBefore: 30,
  }), null, now);
  assert.equal(due?.severity, 'due');
  assert.equal(due?.remainingDays, 0);
});

test('odometer reminders use the web UI warning threshold and overdue boundary', () => {
  const record = reminderRecord({
    reminderMode: 'recurring_odometer',
    odometer: 50_000,
    recurringIntervalKm: 10_000,
  });
  const due = calculateRecordReminder(record, 59_500, new Date(2026, 3, 15));
  assert.equal(due?.severity, 'due');
  assert.equal(due?.dueOdometerKm, 60_000);
  assert.equal(due?.remainingKm, 500);

  const overdue = calculateRecordReminder(record, 61_000, new Date(2026, 3, 15));
  assert.equal(overdue?.severity, 'overdue');
  assert.equal(overdue?.remainingKm, -1_000);
  assert.equal(calculateRecordReminder(record, null, new Date(2026, 3, 15)), null);
});
