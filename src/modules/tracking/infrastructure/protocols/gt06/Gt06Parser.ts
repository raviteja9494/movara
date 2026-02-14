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
  // Decoded high-level data when available
  data?: {
    imei?: string;
    timestamp?: Date;
    latitude?: number;
    longitude?: number;
    speed?: number;
  };
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

    const base: Gt06Packet = {
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

    // If checksum valid, attempt lightweight decoding of known packet types
    if (checksumValid) {
      try {
        if (packetType === 'login') {
          const imei = this.decodeImeiFromLogin(payload);
          base.data = { imei };
        } else if (packetType === 'gps') {
          const decoded = this.decodeGpsPayload(payload);
          base.data = decoded;
        } else if (packetType === 'heartbeat') {
          // Heartbeat may contain device info similar to login; try to extract IMEI
          const imei = this.decodeImeiFromLogin(payload);
          base.data = { imei };
        }
      } catch (e) {
        // Swallow decoding errors; keep packet valid but without data
      }
    }

    return base;
  }

  /**
   * Convert BCD-encoded buffer to string of digits
   */
  private bcdToString(buf: Buffer): string {
    let out = '';
    for (let i = 0; i < buf.length; i++) {
      const hi = (buf[i] & 0xf0) >> 4;
      const lo = buf[i] & 0x0f;
      out += hi.toString(10);
      out += lo.toString(10);
    }
    // Trim leading zeros
    return out.replace(/^0+/, '');
  }

  /**
   * Decode IMEI from login payload (first 8 bytes usually BCD)
   */
  private decodeImeiFromLogin(payload: Buffer): string | undefined {
    if (payload.length >= 8) {
      const imeiBuf = payload.subarray(0, 8);
      const imei = this.bcdToString(imeiBuf);
      if (imei.length >= 10) return imei;
    }
    return undefined;
  }

  /**
   * Decode GPS payload (best-effort). Many GT06 devices encode:
   * [0] - status/alarm
   * [1..4] - latitude (4 bytes int)
   * [5..8] - longitude (4 bytes int)
   * [9] - speed (1 byte)
   * [10..15] - timestamp (6 bytes BCD YYMMDDhhmmss)
   */
  private decodeGpsPayload(payload: Buffer): { imei?: string; timestamp?: Date; latitude?: number; longitude?: number; speed?: number } {
    const result: { imei?: string; timestamp?: Date; latitude?: number; longitude?: number; speed?: number } = {};

    // Try latitude/longitude as 4-byte signed integers divided by 1e6
    if (payload.length >= 10) {
      try {
        const latRaw = payload.readInt32BE(1);
        const lonRaw = payload.readInt32BE(5);
        result.latitude = +(latRaw / 1e6);
        result.longitude = +(lonRaw / 1e6);
      } catch (e) {
        // ignore
      }
    }

    // Speed (one byte at position 9)
    if (payload.length >= 10) {
      result.speed = payload.readUInt8(9);
    }

    // Timestamp BCD at the end (last 6 bytes)
    if (payload.length >= 6) {
      const tsBuf = payload.subarray(payload.length - 6);
      const ts = this.parseBcdTimestamp(tsBuf);
      if (ts) result.timestamp = ts;
    }

    // Some GPS payloads include IMEI after header; attempt naive extraction
    if (payload.length >= 14) {
      // Look for BCD-like sequence of length 8 near start
      const maybe = payload.subarray(0, Math.min(12, payload.length));
      const imei = this.bcdToString(maybe.subarray(0, Math.min(8, maybe.length)));
      if (imei.length >= 10) result.imei = imei;
    }

    return result;
  }

  /**
   * Parse 6-byte BCD timestamp (YY MM DD HH mm SS) into Date
   */
  private parseBcdTimestamp(buf: Buffer): Date | undefined {
    if (buf.length !== 6) return undefined;
    const toNum = (b: number) => ((b & 0xf0) >> 4) * 10 + (b & 0x0f);
    try {
      const yy = toNum(buf[0]);
      const mo = toNum(buf[1]);
      const dd = toNum(buf[2]);
      const hh = toNum(buf[3]);
      const mm = toNum(buf[4]);
      const ss = toNum(buf[5]);
      const year = 2000 + yy;
      return new Date(Date.UTC(year, mo - 1, dd, hh, mm, ss));
    } catch (e) {
      return undefined;
    }
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
