/**
 * GT06 Protocol Parser
 * Decodes standard 0x7878 GT06 messages.
 *
 * Packet format:
 * [0x78, 0x78] [Length:1] [Type:1] [Info:*] [Serial:2] [CRC:2] [0x0D, 0x0A]
 *
 * Length = type(1) + info(*) + serial(2) + crc(2)
 */

export type Gt06PacketType = 'login' | 'gps' | 'heartbeat' | 'info' | 'unknown';

export interface Gt06Packet {
  type: Gt06PacketType;
  length: number;
  messageType: number;
  payload: Buffer;
  serialNumber: number;
  checksum: number;
  valid: boolean;
  error?: string;
  data?: {
    imei?: string;
    timestamp?: Date;
    latitude?: number;
    longitude?: number;
    speed?: number;
    attributes?: Record<string, unknown> | null;
  };
}

export class Gt06Parser {
  private static readonly SYNC_BYTE_1 = 0x78;
  private static readonly SYNC_BYTE_2 = 0x78;
  private static readonly SYNC_BYTE_EXT_1 = 0x79;
  private static readonly SYNC_BYTE_EXT_2 = 0x79;
  private static readonly END_BYTE_1 = 0x0d;
  private static readonly END_BYTE_2 = 0x0a;

  private static readonly MESSAGE_TYPE_LOGIN = 0x01;
  private static readonly MESSAGE_TYPE_GPS = 0x10;
  private static readonly MESSAGE_TYPE_GPS_LBS = 0x12;
  private static readonly MESSAGE_TYPE_GPS_STATUS = 0x22;
  private static readonly MESSAGE_TYPE_HEARTBEAT = 0x13;
  private static readonly MESSAGE_TYPE_INFO = 0x94;
  private static readonly MESSAGE_TYPE_SHORT_STATUS = 0x8a;

  parse(buffer: Buffer): Gt06Packet {
    // Minimum packet: sync(2) + length(1/2) + type(1) + serial(2) + crc(2) + end(2)
    if (buffer.length < 10) {
      return this.invalid(`Packet too short: ${buffer.length} bytes`);
    }

    const isStandardFrame =
      buffer[0] === Gt06Parser.SYNC_BYTE_1 &&
      buffer[1] === Gt06Parser.SYNC_BYTE_2;
    const isExtendedFrame =
      buffer[0] === Gt06Parser.SYNC_BYTE_EXT_1 &&
      buffer[1] === Gt06Parser.SYNC_BYTE_EXT_2;

    if (!isStandardFrame && !isExtendedFrame) {
      return this.invalid(
        `Invalid sync bytes: ${buffer[0].toString(16)} ${buffer[1].toString(16)}`,
      );
    }

    const lengthFieldBytes = isExtendedFrame ? 2 : 1;
    const length = isExtendedFrame ? buffer.readUInt16BE(2) : buffer.readUInt8(2);
    const expectedPacketLength = 2 + lengthFieldBytes + length + 2;
    if (buffer.length < expectedPacketLength) {
      return this.invalid(
        `Incomplete packet: expected ${expectedPacketLength}, got ${buffer.length}`,
        length,
      );
    }

    const messageTypeOffset = 2 + lengthFieldBytes;
    const messageType = buffer[messageTypeOffset];
    const infoLength = Math.max(0, length - 5);
    const payloadStart = messageTypeOffset + 1;
    const payloadEnd = payloadStart + infoLength;
    const serialOffset = payloadEnd;
    const checksumOffset = serialOffset + 2;
    const endOffset = checksumOffset + 2;

    if (
      buffer[endOffset] !== Gt06Parser.END_BYTE_1 ||
      buffer[endOffset + 1] !== Gt06Parser.END_BYTE_2
    ) {
      return this.invalid(
        `Invalid end bytes: ${buffer[endOffset]?.toString(16)} ${buffer[endOffset + 1]?.toString(16)}`,
        length,
        messageType,
      );
    }

    const payload = buffer.subarray(payloadStart, payloadEnd);
    const serialNumber = buffer.readUInt16BE(serialOffset);
    const checksum = buffer.readUInt16BE(checksumOffset);
    const calculatedChecksum = this.calculateChecksum(
      buffer.subarray(2, checksumOffset),
    );
    const checksumValid = checksum === calculatedChecksum;
    const packetType = this.getPacketType(messageType);

    const packet: Gt06Packet = {
      type: packetType,
      length,
      messageType,
      payload,
      serialNumber,
      checksum,
      valid: checksumValid,
      error: !checksumValid
        ? `Checksum mismatch: expected ${calculatedChecksum.toString(16)}, got ${checksum.toString(16)}`
        : undefined,
    };

    if (!checksumValid) {
      return packet;
    }

    try {
      if (packetType === 'login') {
        packet.data = { imei: this.decodeImeiFromLogin(payload) };
      } else if (packetType === 'gps') {
        packet.data = this.decodeGpsPayload(payload);
      } else if (packetType === 'heartbeat') {
        packet.data = this.decodeHeartbeatPayload(payload);
      } else if (packetType === 'info') {
        packet.data = this.decodeInfoPayload(messageType, payload);
      }
    } catch {
      // Keep packet valid even if best-effort decoding fails.
    }

    return packet;
  }

  private invalid(error: string, length = 0, messageType = 0): Gt06Packet {
    return {
      type: 'unknown',
      length,
      messageType,
      payload: Buffer.alloc(0),
      serialNumber: 0,
      checksum: 0,
      valid: false,
      error,
    };
  }

  private bcdToString(buf: Buffer): string {
    let out = '';
    for (let i = 0; i < buf.length; i++) {
      const hi = (buf[i] & 0xf0) >> 4;
      const lo = buf[i] & 0x0f;
      out += hi.toString(10);
      out += lo.toString(10);
    }
    return out.replace(/^0+/, '');
  }

  private decodeImeiFromLogin(payload: Buffer): string | undefined {
    if (payload.length < 8) return undefined;
    const hasOnlyBcdDigits = [...payload.subarray(0, 8)].every(
      (byte) => ((byte & 0xf0) >> 4) <= 9 && (byte & 0x0f) <= 9,
    );
    if (!hasOnlyBcdDigits) return undefined;
    const imei = this.bcdToString(payload.subarray(0, 8));
    return imei.length >= 10 ? imei : undefined;
  }

  private decodeGpsPayload(payload: Buffer): {
    imei?: string;
    timestamp?: Date;
    latitude?: number;
    longitude?: number;
    speed?: number;
    attributes?: Record<string, unknown> | null;
  } {
    const result: {
      imei?: string;
      timestamp?: Date;
      latitude?: number;
      longitude?: number;
      speed?: number;
      attributes?: Record<string, unknown> | null;
    } = {};

    // Standard GT06 location packets start with:
    // [time:6][gpsLenSat:1][lat:4][lon:4][speed:1][courseStatus:2]
    if (payload.length >= 18) {
      const ts = this.parseBcdTimestamp(payload.subarray(0, 6));
      if (ts) result.timestamp = ts;
      const gpsLenSat = payload.readUInt8(6);
      const satellites = gpsLenSat & 0x0f;
      const latRaw = payload.readUInt32BE(7);
      const lonRaw = payload.readUInt32BE(11);
      result.latitude = +(latRaw / (60 * 30000));
      result.longitude = +(lonRaw / (60 * 30000));
      result.speed = payload.readUInt8(15);

      const courseStatus = payload.readUInt16BE(16);
      const valid = (courseStatus & 0x1000) !== 0;
      const latitudeHemisphereSouth = (courseStatus & 0x0400) === 0;
      const longitudeHemisphereWest = (courseStatus & 0x0800) !== 0;
      if (latitudeHemisphereSouth && result.latitude != null) {
        result.latitude = -result.latitude;
      }
      if (longitudeHemisphereWest && result.longitude != null) {
        result.longitude = -result.longitude;
      }

      result.attributes = {
        ...(result.attributes ?? {}),
        satellites,
        course: courseStatus & 0x03ff,
        gps_fix: valid,
        ignition: (courseStatus & 0x4000) !== 0 ? (courseStatus & 0x8000) !== 0 : undefined,
        raw_course_status: courseStatus,
      };
    } else if (payload.length >= 6) {
      const ts = this.parseBcdTimestamp(payload.subarray(payload.length - 6));
      if (ts) result.timestamp = ts;
    }

    const attrs = this.decodeGpsAttributes(payload, result.attributes ?? undefined);
    if (attrs) result.attributes = attrs;
    return result;
  }

  private decodeHeartbeatPayload(payload: Buffer): {
    imei?: string;
    attributes?: Record<string, unknown> | null;
  } {
    const imei = this.decodeImeiFromLogin(payload);
    if (payload.length < 5) {
      return { imei };
    }

    const terminalInfo = payload.readUInt8(0);
    const voltageLevel = payload.readUInt8(1);
    const gsmSignal = payload.readUInt8(2);
    return {
      imei,
      attributes: {
        ignition: (terminalInfo & 0x02) !== 0,
        charging: (terminalInfo & 0x04) !== 0,
        defense_armed: (terminalInfo & 0x01) !== 0,
        gps_tracking: (terminalInfo & 0x40) !== 0,
        battery_level_code: voltageLevel,
        battery_level: this.mapHeartbeatBatteryLevel(voltageLevel),
        gsm_signal_code: gsmSignal,
        gsm_signal_percent: this.mapHeartbeatGsmSignal(gsmSignal),
        heartbeat_alarm_code: payload.readUInt16BE(3),
      },
    };
  }

  private decodeInfoPayload(
    messageType: number,
    payload: Buffer,
  ): {
    imei?: string;
    attributes?: Record<string, unknown> | null;
  } {
    const attributes: Record<string, unknown> = {
      gt06_last_info_type: `0x${messageType.toString(16).toUpperCase().padStart(2, '0')}`,
    };

    if (messageType === Gt06Parser.MESSAGE_TYPE_SHORT_STATUS) {
      return { attributes };
    }

    if (messageType !== Gt06Parser.MESSAGE_TYPE_INFO || payload.length === 0) {
      return { attributes };
    }

    const subtype = payload.readUInt8(0);
    attributes.gt06_info_subtype = `0x${subtype.toString(16).toUpperCase().padStart(2, '0')}`;

    let imei: string | undefined;
    if (payload.length >= 9) {
      const decodedImei = this.decodeImeiFromLogin(payload.subarray(1, 9));
      if (decodedImei) {
        imei = decodedImei;
        attributes.gt06_report_imei = decodedImei;
      }
    }

    const asciiStart = this.findAsciiStart(payload.subarray(1));
    if (asciiStart !== -1) {
      const textStart = 1 + asciiStart;
      const terminatorIndex = payload.indexOf(0x00, textStart);
      const rawText = payload
        .subarray(textStart, terminatorIndex === -1 ? payload.length : terminatorIndex)
        .toString('utf8')
        .trim();
      if (rawText) {
        attributes.gt06_report_text = rawText;
        const fields = this.parseKeyValueText(rawText);
        if (Object.keys(fields).length > 0) {
          attributes.gt06_report_fields = fields;
          if (typeof fields.fence === 'string') {
            attributes.gt06_fence = fields.fence;
          }
          if (typeof fields.sta1 === 'string') {
            attributes.gt06_status_code = fields.sta1;
          }
        }
      }
    } else if (payload.length > 1) {
      attributes.gt06_info_payload_hex = payload.subarray(1).toString('hex').toUpperCase();
    }

    return { imei, attributes };
  }

  private decodeGpsAttributes(
    payload: Buffer,
    current: Record<string, unknown> | undefined,
  ): Record<string, unknown> | null {
    if (payload.length === 0) return current ?? null;

    // Fallback for simpler variants where the first byte behaves like a status byte.
    const statusByte = payload.readUInt8(0);
    return {
      ...current,
      ...(current?.ignition === undefined ? { ignition: (statusByte & 0x02) !== 0 } : {}),
      ...(current?.gps_fix === undefined ? { gps_fix: (statusByte & 0x40) !== 0 } : {}),
      raw_status_byte: statusByte,
    };
  }

  private mapHeartbeatBatteryLevel(level: number): number | null {
    if (!Number.isFinite(level) || level <= 0) return null;
    return Math.max(0, Math.min(level, 6)) / 6;
  }

  private mapHeartbeatGsmSignal(level: number): number | null {
    if (!Number.isFinite(level) || level < 0) return null;
    return Math.max(0, Math.min(level, 4)) / 4;
  }

  private parseBcdTimestamp(buf: Buffer): Date | undefined {
    if (buf.length !== 6) return undefined;
    const hasInvalidBcdNibble = [...buf].some((b) => ((b & 0xf0) >> 4) > 9 || (b & 0x0f) > 9);
    const toNum = (b: number) => {
      if (hasInvalidBcdNibble) return b;
      return ((b & 0xf0) >> 4) * 10 + (b & 0x0f);
    };
    try {
      const yy = toNum(buf[0]);
      const mo = toNum(buf[1]);
      const dd = toNum(buf[2]);
      const hh = toNum(buf[3]);
      const mm = toNum(buf[4]);
      const ss = toNum(buf[5]);
      return new Date(Date.UTC(2000 + yy, mo - 1, dd, hh, mm, ss));
    } catch {
      return undefined;
    }
  }

  private getPacketType(messageType: number): Gt06PacketType {
    switch (messageType) {
      case Gt06Parser.MESSAGE_TYPE_LOGIN:
        return 'login';
      case Gt06Parser.MESSAGE_TYPE_GPS:
      case Gt06Parser.MESSAGE_TYPE_GPS_LBS:
      case Gt06Parser.MESSAGE_TYPE_GPS_STATUS:
        return 'gps';
      case Gt06Parser.MESSAGE_TYPE_HEARTBEAT:
        return 'heartbeat';
      case Gt06Parser.MESSAGE_TYPE_INFO:
      case Gt06Parser.MESSAGE_TYPE_SHORT_STATUS:
        return 'info';
      default:
        return 'unknown';
    }
  }

  private findAsciiStart(buf: Buffer): number {
    for (let i = 0; i < buf.length; i++) {
      const slice = buf.subarray(i);
      const printable = [...slice.subarray(0, Math.min(slice.length, 16))].filter((b) => b >= 0x20 && b <= 0x7e).length;
      if (printable >= 10) {
        return i;
      }
    }
    return -1;
  }

  private parseKeyValueText(text: string): Record<string, string> {
    return text
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return acc;
        const key = part.slice(0, idx).trim().toLowerCase();
        const value = part.slice(idx + 1).trim();
        if (key) {
          acc[key] = value;
        }
        return acc;
      }, {});
  }

  private calculateChecksum(data: Buffer): number {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc & 0x0001) !== 0 ? (crc >> 1) ^ 0x8408 : crc >> 1;
      }
    }
    return (~crc) & 0xffff;
  }
}
