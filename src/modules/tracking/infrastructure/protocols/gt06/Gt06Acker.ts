import { Buffer } from 'buffer';

/**
 * Build a standard GT06 ACK frame for 0x7878 packets.
 *
 * ACK format:
 * [0x78, 0x78] [0x05] [messageType] [serial:2] [crc:2] [0x0D, 0x0A]
 */
export function buildAck(messageType: number, serialNumber: number): Buffer {
  const buf = Buffer.alloc(10);
  buf[0] = 0x78;
  buf[1] = 0x78;
  buf[2] = 0x05;
  buf[3] = messageType;
  buf.writeUInt16BE(serialNumber & 0xffff, 4);
  const crc = calculateCrc(buf.subarray(2, 6));
  buf.writeUInt16BE(crc, 6);
  buf[8] = 0x0d;
  buf[9] = 0x0a;
  return buf;
}

function calculateCrc(data: Buffer): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x0001) !== 0 ? (crc >> 1) ^ 0x8408 : crc >> 1;
    }
  }
  return (~crc) & 0xffff;
}
