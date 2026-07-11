import assert from 'node:assert/strict';
import { EelinkParser } from '../src/modules/tracking/infrastructure/protocols/eelink/EelinkParser';

function bufferFromHex(hex: string): Buffer {
  return Buffer.from(
    hex
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseInt(part, 16)),
  );
}

const parser = new EelinkParser();

{
  const packet = parser.parse(
    bufferFromHex('67 67 01 00 0B 00 01 08 67 23 20 56 64 34 64 01'),
  );

  assert.equal(packet.valid, true);
  assert.equal(packet.type, 'login');
  assert.equal(packet.sequence, 1);
  assert.equal(packet.data?.imei, '867232056643464');
  assert.deepEqual(packet.data?.attributes, {
    eelink_language_code: 1,
  });
}

{
  const packet = parser.parse(
    bufferFromHex(
      '67 67 02 00 1B 00 03 69 CA 6C C3 01 6A 79 60 08 56 46 C0 00 00 00 01 94 00 2D 62 35 00 31 59 03',
    ),
  );

  assert.equal(packet.valid, true);
  assert.equal(packet.type, 'location_compact');
  assert.equal(packet.sequence, 3);
  assert.equal(packet.data?.timestamp?.toISOString(), '2026-03-30T12:29:55.000Z');
  assert.equal(packet.data?.latitude, 13.19728);
  assert.equal(packet.data?.longitude, 77.70663111111111);
  assert.equal(packet.data?.speed, 0);
  assert.deepEqual(packet.data?.attributes, {
    eelink_location_variant: 'compact',
    eelink_location_status_raw: 3,
    gps_fix: true,
    ignition: true,
    course: 0,
    mcc: 404,
    mnc: 45,
    lac: 25141,
    cid: 12633,
  });
}

{
  const packet = parser.parse(bufferFromHex('67 67 07 00 06 00 12 00 97 04 64'));

  assert.equal(packet.valid, true);
  assert.equal(packet.type, 'status');
  assert.equal(packet.sequence, 18);
  assert.deepEqual(packet.data?.attributes, {
    gps_fix: true,
    ignition: true,
    accelerometer_supported: false,
    motion_warning_enabled: true,
    relay_supported: false,
    relay_triggered: false,
    external_charging_supported: true,
    charging: false,
    device_active: false,
    gps_module_running: false,
    obd_module_running: false,
    din0: false,
    din1: false,
    din2: false,
    din3: false,
    eelink_status_raw: 151,
    eelink_gsm_signal_level: 4,
    gsm_signal_percent: 1,
    battery_level: 1,
    battery_percent: 100,
  });
}

{
  const packet = parser.parse(
    bufferFromHex(
      '67 67 91 00 24 00 05 55 6C 17 06 00 01 94 2D 05 61 FD 00 2A 82 16 61 FD 00 2A 83 14 61 FD 00 F0 DD 10 00 00 00 00 00 00 00',
    ),
  );

  assert.equal(packet.valid, true);
  assert.equal(packet.type, 'lbs');
  assert.equal(packet.sequence, 5);
  assert.deepEqual(packet.data?.attributes, {
    eelink_location_variant: 'lbs',
    eelink_lbs_counter: 1433147142,
    eelink_lbs_mode: 0,
    mcc: 404,
    mnc: 45,
    eelink_lbs_cell_count: 5,
    gps_fix: false,
    lac: 25085,
    cid: 10882,
    eelink_gsm_signal_raw: 22,
    eelink_lbs_cells: [
      { lac: 25085, cid: 10882, signal: 22 },
      { lac: 25085, cid: 10883, signal: 20 },
      { lac: 25085, cid: 61661, signal: 16 },
      { lac: 0, cid: 0, signal: 0 },
    ],
  });
}

console.log('Eelink parser verification passed.');
