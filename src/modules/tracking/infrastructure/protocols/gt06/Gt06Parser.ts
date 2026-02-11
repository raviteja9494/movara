/**
 * GT06 Protocol Parser
 * Decodes GT06 GPS tracker messages
 * 
 * Protocol: Binary format with packet structure
 * Used by: GPS trackers, vehicle tracking devices
 * 
 * Packet Structure:
 * [0x78, 0x78] [Length:2] [Type:1] [Payload:*] [Checksum:1] [0x0D, 0x0A]
 */

export type Gt06PacketType = 'login' | 'gps' | 'heartbeat' | 'unknown';

export interface Gt06Packet {
  type: Gt06PacketType;
  length: number;
  messageType: number;
  payload: Buffer;
  checksum: number;
  valid: boolean;
  error?: string;
}

export class Gt06Parser {
  private static readonly SYNC_BYTE_1 = 0x78;
  private static readonly SYNC_BYTE_2 = 0x78;
  private static readonly END_BYTE_1 = 0x0d;
  private static readonly END_BYTE_2 = 0x0a;

  private static readonly MESSAGE_TYPE_LOGIN = 0x01;
  private static readonly MESSAGE_TYPE_GPS = 0x12;
  private static readonly MESSAGE_TYPE_HEARTBEAT = 0x13;

  /**
   * Parse raw GT06 protocol bytes into structured packet
   * @param buffer Raw bytes from device
   * @returns Parsed packet with type and validation
   */
  parse(buffer: Buffer): Gt06Packet {
    // Minimum packet: sync(2) + length(2) + type(1) + checksum(1) + end(2) = 8 bytes
    if (buffer.length < 8) {
      return {
        type: 'unknown',
        length: 0,
        messageType: 0,
        payload: Buffer.alloc(0),
        checksum: 0,
        valid: false,
        error: `Packet too short: ${buffer.length} bytes`,
      };
    }

    // Validate sync bytes
    if (
      buffer[0] !== Gt06Parser.SYNC_BYTE_1 ||
      buffer[1] !== Gt06Parser.SYNC_BYTE_2
    ) {
      return {
        type: 'unknown',
        length: 0,
        messageType: 0,
        payload: Buffer.alloc(0),
        checksum: 0,
        valid: false,
        error: `Invalid sync bytes: ${buffer[0].toString(16)} ${buffer[1].toString(16)}`,
      };
    }

    // Extract length (big-endian)
    const length = buffer.readUInt16BE(2);

    // Validate packet length
    const expectedPacketLength = length + 6; // +2 sync, +2 length, +1 checksum, +1 end(0x0d), +1 end(0x0a) but end is counted in length?
    // GT06: length includes everything except sync and length itself
    const payloadAndTypeLength = length - 1; // -1 for message type

    if (buffer.length < 2 + 2 + length + 2) {
      return {
        type: 'unknown',
        length,
        messageType: 0,
        payload: Buffer.alloc(0),
        checksum: 0,
        valid: false,
        error: `Incomplete packet: expected ${2 + 2 + length + 2}, got ${buffer.length}`,
      };
    }

    // Validate end bytes
    const endOffset = 2 + 2 + length + 1; // after checksum
    if (
      buffer[endOffset] !== Gt06Parser.END_BYTE_1 ||
      buffer[endOffset + 1] !== Gt06Parser.END_BYTE_2
    ) {
      return {
        type: 'unknown',
        length,
        messageType: 0,
        payload: Buffer.alloc(0),
        checksum: 0,
        valid: false,
        error: `Invalid end bytes: ${buffer[endOffset]?.toString(16)} ${buffer[endOffset + 1]?.toString(16)}`,
      };
    }

    // Extract message type
    const messageType = buffer[4];
    const payload = buffer.subarray(5, 4 + length);

    // Extract and validate checksum
    const checksumOffset = 4 + length;
    const checksum = buffer[checksumOffset];
    const calculatedChecksum = this.calculateChecksum(
      buffer.subarray(2, checksumOffset),
    );
    const checksumValid = checksum === calculatedChecksum;

    const packetType = this.getPacketType(messageType);

    return {
      type: packetType,
      length,
      messageType,
      payload,
      checksum,
      valid: checksumValid,
      error: !checksumValid
        ? `Checksum mismatch: expected ${calculatedChecksum.toString(16)}, got ${checksum.toString(16)}`
        : undefined,
    };
  }

  /**
   * Determine packet type from message type byte
   */
  private getPacketType(messageType: number): Gt06PacketType {
    switch (messageType) {
      case Gt06Parser.MESSAGE_TYPE_LOGIN:
        return 'login';
      case Gt06Parser.MESSAGE_TYPE_GPS:
        return 'gps';
      case Gt06Parser.MESSAGE_TYPE_HEARTBEAT:
        return 'heartbeat';
      default:
        return 'unknown';
    }
  }

  /**
   * Calculate GT06 checksum (XOR of all bytes)
   */
  private calculateChecksum(data: Buffer): number {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum ^= data[i];
    }
    return checksum;
  }
}
