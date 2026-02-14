import { Buffer } from 'buffer';

/**
 * GT06 ACK builder (isolated implementation)
 * Builds a minimal GT06 response packet given a message type and optional payload.
 *
 * Packet format produced:
 * [0x78, 0x78] [length:2] [messageType:1] [payload:*] [checksum:1] [0x0D,0x0A]
 * where length = 1 (messageType) + payload.length
 */
export function buildAck(messageType: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const length = 1 + payload.length; // messageType + payload
  const buf = Buffer.alloc(2 + 2 + length + 1 + 2); // sync(2)+len(2)+body(length)+checksum(1)+end(2)

  // Sync bytes
  buf[0] = 0x78;
  buf[1] = 0x78;

  // Length big-endian
  buf.writeUInt16BE(length, 2);

  // Message type
  buf[4] = messageType;

  // Payload (if any)
  if (payload.length > 0) {
    payload.copy(buf, 5);
  }

  // Checksum: XOR of bytes from length (offset 2) up to last payload byte (inclusive)
  const checksumOffsetStart = 2;
  const checksumOffsetEnd = 4 + length; // exclusive? parser expected checksum at 4+length
  let checksum = 0;
  for (let i = checksumOffsetStart; i < checksumOffsetEnd; i++) {
    checksum ^= buf[i];
  }

  const checksumPos = 4 + length;
  buf[checksumPos] = checksum;

  // End bytes
  buf[checksumPos + 1] = 0x0d;
  buf[checksumPos + 2] = 0x0a;

  return buf;
}
