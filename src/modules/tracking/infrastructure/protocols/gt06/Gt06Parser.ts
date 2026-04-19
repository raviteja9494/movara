/**
 * GT06 Protocol Parser
 * Decodes standard 0x7878 GT06 messages.
 *
 * Packet format:
 * [0x78, 0x78] [Length:1] [Type:1] [Info:*] [Serial:2] [CRC:2] [0x0D, 0x0A]
 *
 * Length = type(1) + info(*) + serial(2) + crc(2)
 */

export type Gt06PacketType = 'login' | 'gps' | 'heartbeat' | 'info' | 'command_response' | 'unknown';

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
    response?: string | null;
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
  private static readonly MESSAGE_TYPE_STATUS_RESPONSE = 0x21;
  private static readonly MESSAGE_TYPE_STRING = 0x15;
  private static readonly MESSAGE_TYPE_INFO = 0x94;
  private static readonly MESSAGE_TYPE_TIME_SYNC = 0x8a;
  private static readonly MESSAGE_TYPE_COMMAND_0 = 0x80;
  private static readonly MESSAGE_TYPE_COMMAND_1 = 0x81;
  private static readonly MESSAGE_TYPE_COMMAND_2 = 0x82;

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
        packet.data = this.decodeLoginPayload(payload);
      } else if (packetType === 'gps') {
        packet.data = this.decodeGpsPayload(payload);
      } else if (packetType === 'heartbeat') {
        packet.data = this.decodeHeartbeatPayload(payload);
      } else if (packetType === 'info') {
        packet.data = this.decodeInfoPayload(messageType, payload);
      } else if (packetType === 'command_response') {
        packet.data = this.decodeCommandResponsePayload(messageType, payload);
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

  private decodeLoginPayload(payload: Buffer): {
    imei?: string;
    attributes?: Record<string, unknown> | null;
  } {
    const imei = this.decodeImeiFromLogin(payload);
    const attributes: Record<string, unknown> = {};

    if (payload.length >= 10) {
      attributes.gt06_login_type_identifier = `0x${payload.subarray(8, 10).toString('hex').toUpperCase()}`;
    }

    if (payload.length >= 12) {
      attributes.gt06_login_timezone_language = `0x${payload.subarray(10, 12).toString('hex').toUpperCase()}`;
    }

    return {
      imei,
      attributes: Object.keys(attributes).length > 0 ? attributes : null,
    };
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
      const gpsInfoLength = (gpsLenSat & 0xf0) >> 4;
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
        gps_info_length: gpsInfoLength,
        satellites,
        course: courseStatus & 0x03ff,
        gps_fix: valid,
        ignition: (courseStatus & 0x4000) !== 0 ? (courseStatus & 0x8000) !== 0 : undefined,
        raw_course_status: courseStatus,
      };

      let offset = 18;
      if (payload.length >= offset + 2) {
        result.attributes.mcc = payload.readUInt16BE(offset);
        offset += 2;
      }
      if (payload.length >= offset + 1) {
        result.attributes.mnc = payload.readUInt8(offset);
        offset += 1;
      }
      if (payload.length >= offset + 2) {
        result.attributes.lac = payload.readUInt16BE(offset);
        offset += 2;
      }
      if (payload.length >= offset + 3) {
        result.attributes.cid = payload.readUIntBE(offset, 3);
        offset += 3;
      }
      if (payload.length >= offset + 1) {
        const gpsAccRaw = payload.readUInt8(offset);
        result.attributes.gt06_gps_acc_raw = gpsAccRaw;
        result.attributes.gt06_gps_acc = gpsAccRaw !== 0;
        offset += 1;
      }
      if (payload.length >= offset + 1) {
        result.attributes.gt06_upload_mode = payload.readUInt8(offset);
        offset += 1;
      }
      if (payload.length >= offset + 1) {
        result.attributes.gt06_realtime_flag = payload.readUInt8(offset);
        offset += 1;
      }
      if (payload.length >= offset + 4) {
        result.attributes.gt06_mileage_raw = payload.readUInt32BE(offset);
        offset += 4;
      }
      if (payload.length > offset) {
        result.attributes.gt06_tail_hex = payload.subarray(offset).toString('hex').toUpperCase();
      }
    } else if (payload.length >= 6) {
      const ts = this.parseBcdTimestamp(payload.subarray(payload.length - 6));
      if (ts) result.timestamp = ts;
    }
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

    if (messageType === Gt06Parser.MESSAGE_TYPE_TIME_SYNC) {
      attributes.gt06_time_sync_request = true;
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

  private decodeCommandResponsePayload(
    messageType: number,
    payload: Buffer,
  ): {
    response?: string | null;
    attributes?: Record<string, unknown> | null;
  } {
    const response = this.extractPrintableText(payload);
    const attributes: Record<string, unknown> = {
      gt06_command_response_type: `0x${messageType.toString(16).toUpperCase().padStart(2, '0')}`,
    };
    if (response) {
      Object.assign(attributes, this.parseCommandResponseAttributes(response));
    }
    if (!response && payload.length > 0) {
      attributes.gt06_command_response_hex = payload.toString('hex').toUpperCase();
    }
    return {
      response,
      attributes,
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
      case Gt06Parser.MESSAGE_TYPE_STATUS_RESPONSE:
      case Gt06Parser.MESSAGE_TYPE_STRING:
      case Gt06Parser.MESSAGE_TYPE_COMMAND_0:
      case Gt06Parser.MESSAGE_TYPE_COMMAND_1:
      case Gt06Parser.MESSAGE_TYPE_COMMAND_2:
        return 'command_response';
      case Gt06Parser.MESSAGE_TYPE_INFO:
      case Gt06Parser.MESSAGE_TYPE_TIME_SYNC:
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

  private parseCommandResponseAttributes(response: string): Record<string, unknown> {
    const attributes: Record<string, unknown> = {};
    const normalized = response.trim();

    const versionMatch = normalized.match(/^\[VERSION\](.+)$/i);
    if (versionMatch) {
      attributes.gt06_firmware_version = versionMatch[1].trim();
      return attributes;
    }

    const timezoneMatch = normalized.match(/^GMT:\s*([EW]),\s*(\d{1,2}),\s*(\d{1,2})(?:\s*\(([^)]+)\))?$/i);
    if (timezoneMatch) {
      const [, directionRaw, hourRaw, minuteRaw, modeRaw] = timezoneMatch;
      const direction = directionRaw.toUpperCase();
      const hours = Number.parseInt(hourRaw, 10);
      const minutes = Number.parseInt(minuteRaw, 10);
      attributes.gt06_timezone = `${direction},${hours},${minutes}${modeRaw ? ` (${modeRaw.trim()})` : ''}`;
      attributes.gt06_timezone_direction = direction;
      attributes.gt06_timezone_hours = hours;
      attributes.gt06_timezone_minutes = minutes;
      if (modeRaw?.trim()) {
        attributes.gt06_timezone_mode = modeRaw.trim();
      }
      return attributes;
    }

    const centerMatch = normalized.match(/^CENTER:(.*)$/i);
    if (centerMatch) {
      const centerNumber = centerMatch[1].trim();
      attributes.gt06_center_number = centerNumber || 'Not set';
      attributes.gt06_center_number_configured = centerNumber.length > 0;
      return attributes;
    }

    const mileageMatch = normalized.match(
      /^MILEAGE:\s*(ON|OFF)(?:,\s*Total Mileage:\s*([\d.]+)\s*km)?(?:,\s*K:\s*(\d+))?$/i,
    );
    if (mileageMatch) {
      const [, enabledRaw, totalRaw, scaleRaw] = mileageMatch;
      attributes.gt06_mileage_enabled = enabledRaw.toUpperCase() === 'ON';
      if (totalRaw != null) attributes.gt06_total_mileage_km = Number.parseFloat(totalRaw);
      if (scaleRaw != null) attributes.gt06_mileage_scale = Number.parseInt(scaleRaw, 10);
      return attributes;
    }

    const powerAlarmMatch = normalized.match(/^POWERALM:\s*(ON|OFF)(?:,\s*(\d+),\s*(\d+),\s*(\d+))?$/i);
    if (powerAlarmMatch) {
      const [, enabledRaw, modeRaw, delayRaw, chargeRaw] = powerAlarmMatch;
      attributes.gt06_power_alarm_enabled = enabledRaw.toUpperCase() === 'ON';
      if (modeRaw != null) attributes.gt06_power_alarm_mode = Number.parseInt(modeRaw, 10);
      if (delayRaw != null) attributes.gt06_power_alarm_delay_seconds = Number.parseInt(delayRaw, 10);
      if (chargeRaw != null) attributes.gt06_power_alarm_charge_seconds = Number.parseInt(chargeRaw, 10);
      return attributes;
    }

    const batteryAlarmMatch = normalized.match(/^BATALM:\s*(ON|OFF)(?:,\s*(\d+))?$/i);
    if (batteryAlarmMatch) {
      const [, enabledRaw, modeRaw] = batteryAlarmMatch;
      attributes.gt06_low_battery_alarm_enabled = enabledRaw.toUpperCase() === 'ON';
      if (modeRaw != null) attributes.gt06_low_battery_alarm_mode = Number.parseInt(modeRaw, 10);
      return attributes;
    }

    const speedAlarmMatch = normalized.match(/^SPEED:\s*(ON|OFF)(?:,\s*(\d+),\s*(\d+),\s*(\d+))?$/i);
    if (speedAlarmMatch) {
      const [, enabledRaw, durationRaw, thresholdRaw, modeRaw] = speedAlarmMatch;
      attributes.gt06_speed_alarm_enabled = enabledRaw.toUpperCase() === 'ON';
      if (durationRaw != null) attributes.gt06_speed_alarm_duration_seconds = Number.parseInt(durationRaw, 10);
      if (thresholdRaw != null) attributes.gt06_speed_alarm_threshold_kmh = Number.parseInt(thresholdRaw, 10);
      if (modeRaw != null) attributes.gt06_speed_alarm_mode = Number.parseInt(modeRaw, 10);
      return attributes;
    }

    const sensorAlarmMatch = normalized.match(/^SENALM:\s*(ON|OFF)(?:,\s*(\d+))?$/i);
    if (sensorAlarmMatch) {
      const [, enabledRaw, modeRaw] = sensorAlarmMatch;
      attributes.gt06_sensor_alarm_enabled = enabledRaw.toUpperCase() === 'ON';
      if (modeRaw != null) attributes.gt06_sensor_alarm_mode = Number.parseInt(modeRaw, 10);
      return attributes;
    }

    if (/^Battery:/i.test(normalized)) {
      Object.assign(attributes, this.parseStatusResponseAttributes(normalized));
    }

    return attributes;
  }

  private parseStatusResponseAttributes(response: string): Record<string, unknown> {
    const attributes: Record<string, unknown> = {};
    const parts = response
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts) {
      if (/^Battery:/i.test(part)) {
        const batteryMatch = part.match(/^Battery:\s*([\d.]+)V(?:,\s*([A-Z]+))?$/i);
        if (batteryMatch) {
          const [, voltageRaw, stateRaw] = batteryMatch;
          attributes.gt06_status_battery_voltage = Number.parseFloat(voltageRaw);
          if (stateRaw?.trim()) {
            attributes.gt06_status_battery_state = stateRaw.trim().toUpperCase();
          }
        }
        continue;
      }

      if (/^GPRS:/i.test(part)) {
        const gprsMatch = part.match(/^GPRS:\s*([^,;]+)(?:,\s*GPRS2:\s*([^,;]+))?$/i);
        if (gprsMatch) {
          const [, gprsStateRaw, gprs2StateRaw] = gprsMatch;
          const gprsState = gprsStateRaw.trim();
          attributes.gt06_status_gprs = gprsState;
          attributes.gt06_status_gprs_connected = /link\s+up|online/i.test(gprsState);
          if (gprs2StateRaw?.trim()) {
            const gprs2State = gprs2StateRaw.trim();
            attributes.gt06_status_gprs2 = gprs2State;
            attributes.gt06_status_gprs2_connected = /link\s+up|online/i.test(gprs2State);
          }
        }
        continue;
      }

      const signalMatch = part.match(/^GSM Signal Level:\s*(.+)$/i);
      if (signalMatch) {
        attributes.gt06_status_gsm_signal = signalMatch[1].trim();
        continue;
      }

      const gpsMatch = part.match(/^GPS:\s*(ON|OFF)$/i);
      if (gpsMatch) {
        attributes.gt06_status_gps_enabled = gpsMatch[1].toUpperCase() === 'ON';
        continue;
      }

      const accMatch = part.match(/^ACC:\s*(ON|OFF)$/i);
      if (accMatch) {
        attributes.gt06_status_acc_on = accMatch[1].toUpperCase() === 'ON';
        continue;
      }

      const defenseMatch = part.match(/^Defense:\s*(ON|OFF)$/i);
      if (defenseMatch) {
        attributes.gt06_status_defense_armed = defenseMatch[1].toUpperCase() === 'ON';
      }
    }

    return attributes;
  }

  private extractPrintableText(buf: Buffer): string | null {
    const start = this.findAsciiStart(buf);
    if (start === -1) return null;
    const printable = buf
      .subarray(start)
      .toString('utf8')
      .replace(/\0+$/g, '')
      .trim();
    return printable || null;
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
