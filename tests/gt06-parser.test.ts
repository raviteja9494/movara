import assert from 'node:assert/strict';
import { Gt06Parser } from '../src/modules/tracking/infrastructure/protocols/gt06/Gt06Parser';

function bufferFromHex(hex: string): Buffer {
  return Buffer.from(
    hex
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseInt(part, 16)),
  );
}

const parser = new Gt06Parser();

{
  const packet = parser.parse(
    bufferFromHex('78 78 11 01 01 23 45 67 89 01 23 45 80 66 21 21 00 2E 69 F6 0D 0A'),
  );

  assert.equal(packet.valid, true);
  assert.equal(packet.type, 'login');
  assert.equal(packet.serialNumber, 46);
  assert.equal(packet.data?.imei, '123456789012345');
  assert.deepEqual(packet.data?.attributes, {
    gt06_login_type_identifier: '0x8066',
    gt06_login_timezone_language: '0x2121',
  });
}

{
  const packet = parser.parse(
    bufferFromHex(
      '78 78 26 22 1A 04 03 02 1E 1F C4 01 65 74 59 08 56 80 C3 01 04 CC 01 94 2D 61 FD 00 EF E5 01 03 01 00 00 65 56 00 7C 63 F3 0D 0A',
    ),
  );

  assert.equal(packet.valid, true);
  assert.equal(packet.type, 'gps');
  assert.equal(packet.serialNumber, 124);
  assert.equal(packet.data?.timestamp?.toISOString(), '2026-04-03T02:30:31.000Z');
  assert.ok(Math.abs((packet.data?.latitude ?? 0) - 13.014520555555555) < 1e-12);
  assert.ok(Math.abs((packet.data?.longitude ?? 0) - 77.71488166666666) < 1e-12);
  assert.equal(packet.data?.speed, 1);
  assert.deepEqual(packet.data?.attributes, {
    gps_info_length: 12,
    satellites: 4,
    course: 204,
    gps_fix: false,
    ignition: undefined,
    raw_course_status: 1228,
    mcc: 404,
    mnc: 45,
    lac: 25085,
    cid: 61413,
    gt06_gps_acc_raw: 1,
    gt06_gps_acc: true,
    gt06_upload_mode: 3,
    gt06_realtime_flag: 1,
    gt06_mileage_raw: 25942,
  });
}

{
  const packet = parser.parse(bufferFromHex('78 78 05 8A 00 08 61 57 0D 0A'));

  assert.equal(packet.valid, true);
  assert.equal(packet.type, 'info');
  assert.equal(packet.serialNumber, 8);
  assert.deepEqual(packet.data?.attributes, {
    gt06_last_info_type: '0x8A',
    gt06_time_sync_request: true,
  });
}

{
  const response = (parser as any).extractPrintableText(
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, ...Buffer.from('MILEAGE:ON, Total Mileage:5465km,K:1000', 'ascii')]),
  );
  assert.equal(response, 'MILEAGE:ON, Total Mileage:5465km,K:1000');

  const attributes = (parser as any).parseCommandResponseAttributes(response);
  assert.equal(attributes.gt06_mileage_enabled, true);
  assert.equal(attributes.gt06_total_mileage_km, 5465);
  assert.equal(attributes.gt06_mileage_scale, 1000);
}

{
  const response = (parser as any).extractPrintableText(
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, 0x4f, 0x4b, 0x21]),
  );
  assert.equal(response, 'OK!');
}

console.log('GT06 parser verification passed.');
