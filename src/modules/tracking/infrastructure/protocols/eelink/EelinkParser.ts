export type EelinkPacketType =
  | 'login'
  | 'heartbeat'
  | 'status'
  | 'ping'
  | 'location'
  | 'location_compact'
  | 'warning'
  | 'report'
  | 'message'
  | 'command_response'
  | 'obd'
  | 'lbs'
  | 'unknown';

export interface EelinkPacket {
  type: EelinkPacketType;
  pid: number;
  size: number;
  sequence: number;
  content: Buffer;
  valid: boolean;
  error?: string;
  data?: {
    imei?: string;
    timestamp?: Date;
    latitude?: number;
    longitude?: number;
    speed?: number;
    attributes?: Record<string, unknown> | null;
    serverFlag?: number;
    response?: string;
  };
}

interface ParsedPosition {
  nextOffset: number;
  timestamp?: Date;
  latitude?: number;
  longitude?: number;
  speed?: number;
  attributes: Record<string, unknown>;
}

export class EelinkParser {
  private static readonly MARK_1 = 0x67;
  private static readonly MARK_2 = 0x67;

  private static readonly PID_LOGIN = 0x01;
  private static readonly PID_LOCATION_COMPACT = 0x02;
  private static readonly PID_HEARTBEAT = 0x03;
  private static readonly PID_STATUS = 0x07;
  private static readonly PID_PING = 0x08;
  private static readonly PID_LOCATION = 0x12;
  private static readonly PID_WARNING = 0x14;
  private static readonly PID_REPORT = 0x15;
  private static readonly PID_MESSAGE = 0x16;
  private static readonly PID_OBD = 0x17;
  private static readonly PID_COMMAND = 0x80;
  private static readonly PID_LBS = 0x91;

  parse(buffer: Buffer): EelinkPacket {
    if (buffer.length < 7) {
      return this.invalid('Packet too short');
    }
    if (buffer[0] !== EelinkParser.MARK_1 || buffer[1] !== EelinkParser.MARK_2) {
      return this.invalid(`Invalid mark bytes: ${buffer[0]?.toString(16)} ${buffer[1]?.toString(16)}`);
    }

    const pid = buffer.readUInt8(2);
    const size = buffer.readUInt16BE(3);
    const totalLength = 5 + size;
    if (buffer.length < totalLength) {
      return this.invalid(`Incomplete packet: expected ${totalLength}, got ${buffer.length}`, pid, size);
    }
    if (size < 2) {
      return this.invalid(`Invalid packet size: ${size}`, pid, size);
    }

    const sequence = buffer.readUInt16BE(5);
    const content = buffer.subarray(7, totalLength);
    const packet: EelinkPacket = {
      type: this.getPacketType(pid),
      pid,
      size,
      sequence,
      content,
      valid: true,
    };

    try {
      switch (packet.type) {
        case 'login':
          packet.data = this.decodeLogin(content);
          break;
        case 'heartbeat':
          packet.data = this.decodeHeartbeat(content);
          break;
        case 'status':
          packet.data = this.decodeStatusPacket(content);
          break;
        case 'ping':
          packet.data = this.decodePing();
          break;
        case 'location':
          packet.data = this.decodeLocation(content);
          break;
        case 'location_compact':
          packet.data = this.decodeCompactLocation(content);
          break;
        case 'warning':
          packet.data = this.decodeWarning(content);
          break;
        case 'report':
          packet.data = this.decodeReport(content);
          break;
        case 'message':
          packet.data = this.decodeMessage(content);
          break;
        case 'obd':
          packet.data = this.decodeObd(content);
          break;
        case 'command_response':
          packet.data = this.decodeCommandResponse(content);
          break;
        case 'lbs':
          packet.data = this.decodeLbs(content);
          break;
        default:
          break;
      }
    } catch (error) {
      packet.valid = false;
      packet.error = error instanceof Error ? error.message : String(error);
    }

    return packet;
  }

  buildLoginAck(sequence: number, protocolVersion = 0x0001, paramSetAction = 0x03): Buffer {
    const content = Buffer.alloc(7);
    content.writeUInt32BE(Math.floor(Date.now() / 1000), 0);
    content.writeUInt16BE(protocolVersion, 4);
    content.writeUInt8(paramSetAction, 6);
    return this.buildResponse(EelinkParser.PID_LOGIN, sequence, content);
  }

  buildAck(pid: number, sequence: number): Buffer {
    return this.buildResponse(pid, sequence, Buffer.alloc(0));
  }

  buildMessageAck(sequence: number, phoneNumber: string, result = ''): Buffer {
    const phone = Buffer.alloc(21);
    Buffer.from(phoneNumber.slice(0, 21), 'utf8').copy(phone);
    const resultBuffer = Buffer.from(result, 'utf8');
    return this.buildResponse(EelinkParser.PID_MESSAGE, sequence, Buffer.concat([phone, resultBuffer]));
  }

  private buildResponse(pid: number, sequence: number, content: Buffer): Buffer {
    const packet = Buffer.alloc(7 + content.length);
    packet[0] = EelinkParser.MARK_1;
    packet[1] = EelinkParser.MARK_2;
    packet[2] = pid;
    packet.writeUInt16BE(content.length + 2, 3);
    packet.writeUInt16BE(sequence, 5);
    content.copy(packet, 7);
    return packet;
  }

  private decodeLogin(content: Buffer): { imei?: string; attributes?: Record<string, unknown> | null } {
    const imei = content.length >= 8 ? this.decodeImei(content.subarray(0, 8)) : undefined;
    const attributes: Record<string, unknown> = {};
    if (content.length >= 9) attributes.eelink_language_code = content.readUInt8(8);
    if (content.length >= 10) {
      const timezoneQuarters = content.readInt8(9);
      attributes.eelink_timezone_quarters = timezoneQuarters;
      attributes.eelink_timezone_minutes = timezoneQuarters * 15;
    }
    if (content.length >= 12) attributes.eelink_system_version = this.formatVersion(content.readUInt16BE(10));
    if (content.length >= 14) attributes.eelink_app_version = this.formatVersion(content.readUInt16BE(12));
    if (content.length >= 16) attributes.eelink_paramset_version = content.readUInt16BE(14);
    if (content.length >= 18) attributes.eelink_paramset_original_size = content.readUInt16BE(16);
    if (content.length >= 20) attributes.eelink_paramset_compressed_size = content.readUInt16BE(18);
    if (content.length >= 22) attributes.eelink_paramset_checksum = content.readUInt16BE(20);
    return {
      imei,
      attributes: Object.keys(attributes).length > 0 ? attributes : null,
    };
  }

  private decodeHeartbeat(content: Buffer): { attributes?: Record<string, unknown> | null } {
    const status = content.length >= 2 ? content.readUInt16BE(0) : 0;
    return {
      attributes: {
        ...this.decodeStatus(status),
        eelink_status_raw: status,
      },
    };
  }

  private decodeStatusPacket(content: Buffer): { attributes?: Record<string, unknown> | null } {
    const attrs: Record<string, unknown> = {};
    if (content.length >= 2) {
      const status = content.readUInt16BE(0);
      Object.assign(attrs, this.decodeStatus(status), { eelink_status_raw: status });
    }
    if (content.length >= 3) {
      const gsmSignalLevel = content.readUInt8(2);
      attrs.eelink_gsm_signal_level = gsmSignalLevel;
      attrs.gsm_signal_percent = this.normalizeSignalLevel(gsmSignalLevel);
    }
    if (content.length >= 4) {
      const batteryLevel = content.readUInt8(3);
      attrs.battery_level = batteryLevel / 100;
      attrs.battery_percent = batteryLevel;
    }
    return {
      attributes: Object.keys(attrs).length > 0 ? attrs : null,
    };
  }

  private decodePing(): { attributes?: Record<string, unknown> | null } {
    return {
      attributes: null,
    };
  }

  private decodeLocation(content: Buffer): {
    timestamp?: Date;
    latitude?: number;
    longitude?: number;
    speed?: number;
    attributes?: Record<string, unknown> | null;
  } {
    const position = this.parsePosition(content, 0);
    const attrs = { ...position.attributes };
    let offset = position.nextOffset;

    if (content.length >= offset + 2) {
      const status = content.readUInt16BE(offset);
      offset += 2;
      Object.assign(attrs, this.decodeStatus(status), { eelink_status_raw: status });
    }
    if (content.length >= offset + 2) {
      const batteryVoltage = content.readUInt16BE(offset);
      offset += 2;
      attrs.battery_voltage = batteryVoltage / 1000;
      attrs.battery_millivolts = batteryVoltage;
    }
    if (content.length >= offset + 2) {
      const ain0 = content.readUInt16BE(offset);
      offset += 2;
      if (ain0 > 0) attrs.eelink_ain0_voltage = ain0 / 1000;
    }
    if (content.length >= offset + 2) {
      const ain1 = content.readUInt16BE(offset);
      offset += 2;
      if (ain1 > 0) attrs.eelink_ain1_voltage = ain1 / 1000;
    }
    if (content.length >= offset + 4) {
      attrs.odometer = content.readUInt32BE(offset);
      offset += 4;
    }
    if (content.length >= offset + 2) {
      attrs.eelink_gsm_counter_minutes = content.readUInt16BE(offset);
      offset += 2;
    }
    if (content.length >= offset + 2) {
      attrs.eelink_gps_counter_minutes = content.readUInt16BE(offset);
      offset += 2;
    }
    if (content.length >= offset + 2) {
      attrs.eelink_pedometer_steps = content.readUInt16BE(offset);
      offset += 2;
    }
    if (content.length >= offset + 2) {
      attrs.eelink_pedometer_seconds = content.readUInt16BE(offset);
      offset += 2;
    }
    if (content.length >= offset + 2) {
      const raw = content.readInt16BE(offset);
      offset += 2;
      if (raw !== 0) attrs.temperature_c = raw / 256;
    }
    if (content.length >= offset + 2) {
      const raw = content.readUInt16BE(offset);
      offset += 2;
      if (raw !== 0) attrs.humidity_percent = raw / 10;
    }
    if (content.length >= offset + 4) {
      const raw = content.readUInt32BE(offset);
      offset += 4;
      if (raw !== 0) attrs.illuminance_lux = raw / 256;
    }
    if (content.length >= offset + 4) {
      const raw = content.readUInt32BE(offset);
      offset += 4;
      if (raw !== 0) attrs.co2_ppm = raw;
    }

    return {
      timestamp: position.timestamp,
      latitude: position.latitude,
      longitude: position.longitude,
      speed: position.speed,
      attributes: attrs,
    };
  }

  private decodeCompactLocation(content: Buffer): {
    timestamp?: Date;
    latitude?: number;
    longitude?: number;
    speed?: number;
    attributes?: Record<string, unknown> | null;
  } {
    if (content.length < 25) {
      throw new Error('Compact Eelink location content too short');
    }

    const timestamp = this.parseUnixSeconds(content.readUInt32BE(0));
    const rawLatitude = content.readUInt32BE(4);
    const rawLongitude = content.readUInt32BE(8);
    const speed = content.readUInt8(12);
    const course = content.readUInt16BE(13);
    const mcc = content.readUInt16BE(15);
    const mnc = content.readUInt16BE(17);
    const lac = content.readUInt16BE(19);
    const cid = content.readUIntBE(21, 3);
    const locationStatus = content.readUInt8(24);
    const latitude = rawLatitude / 1800000;
    const longitude = rawLongitude / 1800000;

    return {
      timestamp,
      latitude,
      longitude,
      speed,
      attributes: {
        eelink_location_variant: 'compact',
        eelink_location_status_raw: locationStatus,
        gps_fix: (locationStatus & 0x01) !== 0,
        ignition: (locationStatus & 0x02) !== 0,
        course,
        mcc,
        mnc,
        lac,
        cid,
      },
    };
  }

  private decodeWarning(content: Buffer) {
    const position = this.parsePosition(content, 0);
    let offset = position.nextOffset;
    const attrs = { ...position.attributes };
    if (content.length >= offset + 1) {
      attrs.eelink_warning_type = content.readUInt8(offset);
      offset += 1;
    }
    if (content.length >= offset + 2) {
      const status = content.readUInt16BE(offset);
      Object.assign(attrs, this.decodeStatus(status), { eelink_status_raw: status });
    }
    return {
      timestamp: position.timestamp,
      latitude: position.latitude,
      longitude: position.longitude,
      speed: position.speed,
      attributes: attrs,
    };
  }

  private decodeReport(content: Buffer) {
    const position = this.parsePosition(content, 0);
    let offset = position.nextOffset;
    const attrs = { ...position.attributes };
    if (content.length >= offset + 1) {
      const reportType = content.readUInt8(offset);
      attrs.eelink_report_type = reportType;
      attrs.ignition =
        reportType === 0x01 ? true : reportType === 0x02 ? false : attrs.ignition;
      offset += 1;
    }
    if (content.length >= offset + 2) {
      const status = content.readUInt16BE(offset);
      Object.assign(attrs, this.decodeStatus(status), { eelink_status_raw: status });
    }
    return {
      timestamp: position.timestamp,
      latitude: position.latitude,
      longitude: position.longitude,
      speed: position.speed,
      attributes: attrs,
    };
  }

  private decodeObd(content: Buffer) {
    const position = this.parsePosition(content, 0);
    const pidData = content.subarray(position.nextOffset);
    const parsed = this.parseObdPidGroups(pidData);
    return {
      timestamp: position.timestamp,
      latitude: position.latitude,
      longitude: position.longitude,
      speed: position.speed,
      attributes: {
        ...position.attributes,
        ...parsed,
      },
    };
  }

  private decodeLbs(content: Buffer): {
    attributes?: Record<string, unknown> | null;
  } {
    const attrs: Record<string, unknown> = {
      eelink_location_variant: 'lbs',
    };

    if (content.length >= 4) {
      attrs.eelink_lbs_counter = content.readUInt32BE(0);
    }

    if (content.length < 9) {
      return { attributes: attrs };
    }

    let offset = 4;
    const mode = content.readUInt8(offset);
    offset += 1;
    const mcc = content.readUInt16BE(offset);
    offset += 2;
    const mnc = content.readUInt8(offset);
    offset += 1;
    const cellCount = content.readUInt8(offset);
    offset += 1;

    const cells: Array<{ lac: number; cid: number; signal: number }> = [];
    for (let index = 0; index < cellCount && content.length >= offset + 6; index += 1) {
      const lac = content.readUInt16BE(offset);
      offset += 2;
      const cid = content.readUIntBE(offset, 3);
      offset += 3;
      const signal = content.readUInt8(offset);
      offset += 1;
      cells.push({ lac, cid, signal });
    }

    attrs.eelink_lbs_mode = mode;
    attrs.mcc = mcc;
    attrs.mnc = mnc;
    attrs.eelink_lbs_cell_count = cellCount;
    attrs.gps_fix = false;
    if (cells.length > 0) {
      attrs.lac = cells[0].lac;
      attrs.cid = cells[0].cid;
      attrs.eelink_gsm_signal_raw = cells[0].signal;
      attrs.eelink_lbs_cells = cells;
    }

    return {
      attributes: attrs,
    };
  }

  private decodeCommandResponse(content: Buffer): {
    serverFlag?: number;
    response?: string;
    attributes?: Record<string, unknown> | null;
  } {
    if (content.length < 5) {
      throw new Error('Eelink command response content too short');
    }
    const messageSign = content.readUInt8(0);
    const serverFlag = content.readUInt32BE(1);
    const response = content.subarray(5).toString('utf8').replace(/\0+$/g, '').trim();
    return {
      serverFlag,
      response,
      attributes: {
        eelink_message_sign: messageSign,
      },
    };
  }

  private decodeMessage(content: Buffer): {
    response?: string;
    attributes?: Record<string, unknown> | null;
  } {
    const phoneNumber = content.subarray(0, Math.min(content.length, 21)).toString('utf8').replace(/\0+$/g, '').trim();
    const response = content.length > 21
      ? content.subarray(21).toString('utf8').replace(/\0+$/g, '').trim()
      : '';
    return {
      response: response || undefined,
      attributes: {
        eelink_message_phone: phoneNumber || undefined,
      },
    };
  }

  private parsePosition(content: Buffer, offset: number): ParsedPosition {
    if (content.length < offset + 5) {
      throw new Error('Eelink position content too short');
    }
    let cursor = offset;
    const timestamp = this.parseUnixSeconds(content.readUInt32BE(cursor));
    cursor += 4;
    const mask = content.readUInt8(cursor);
    cursor += 1;

    const attributes: Record<string, unknown> = {
      eelink_position_mask: mask,
    };
    let latitude: number | undefined;
    let longitude: number | undefined;
    let speed: number | undefined;

    if ((mask & 0x01) !== 0) {
      if (content.length < cursor + 15) {
        throw new Error('Incomplete Eelink GPS position');
      }
      latitude = content.readInt32BE(cursor) / 1800000;
      cursor += 4;
      longitude = content.readInt32BE(cursor) / 1800000;
      cursor += 4;
      const altitude = content.readInt16BE(cursor);
      cursor += 2;
      speed = content.readUInt16BE(cursor);
      cursor += 2;
      const course = content.readUInt16BE(cursor);
      cursor += 2;
      const satellites = content.readUInt8(cursor);
      cursor += 1;
      Object.assign(attributes, {
        altitude,
        speed,
        course,
        satellites,
        gps_fix: true,
      });
    }

    if ((mask & 0x02) !== 0) {
      if (content.length < cursor + 11) throw new Error('Incomplete Eelink BSID0 data');
      Object.assign(attributes, {
        mcc: content.readUInt16BE(cursor),
        mnc: content.readUInt16BE(cursor + 2),
        lac: content.readUInt16BE(cursor + 4),
        cid: content.readUInt32BE(cursor + 6),
        gsm_signal_dbm: -110 + content.readUInt8(cursor + 10),
      });
      cursor += 11;
    }

    for (const key of ['eelink_neighbor_bsid1', 'eelink_neighbor_bsid2'] as const) {
      const bit = key.endsWith('1') ? 0x04 : 0x08;
      if ((mask & bit) !== 0) {
        if (content.length < cursor + 7) throw new Error(`Incomplete ${key} data`);
        attributes[key] = {
          lac: content.readUInt16BE(cursor),
          cid: content.readUInt32BE(cursor + 2),
          signal: -110 + content.readUInt8(cursor + 6),
        };
        cursor += 7;
      }
    }

    for (const key of ['eelink_wifi_0', 'eelink_wifi_1', 'eelink_wifi_2'] as const) {
      const index = Number(key.slice(-1));
      const bit = 0x10 << index;
      if ((mask & bit) !== 0) {
        if (content.length < cursor + 7) throw new Error(`Incomplete ${key} data`);
        attributes[key] = {
          bssid: this.formatMac(content.subarray(cursor, cursor + 6)),
          rssi: content.readInt8(cursor + 6),
        };
        cursor += 7;
      }
    }

    if ((mask & 0x01) === 0) {
      attributes.gps_fix = false;
    }

    return {
      nextOffset: cursor,
      timestamp,
      latitude,
      longitude,
      speed,
      attributes,
    };
  }

  private parseObdPidGroups(pidData: Buffer): Record<string, unknown> {
    const attributes: Record<string, unknown> = {};
    const rawGroups: Array<{ code: number; value: number }> = [];
    for (let offset = 0; offset + 5 <= pidData.length; offset += 5) {
      const code = pidData.readUInt8(offset);
      const value = pidData.readUInt32BE(offset + 1);
      rawGroups.push({ code, value });
      switch (code) {
        case 0x04:
          attributes.engine_load_percent = value / 2.55;
          break;
        case 0x05:
          attributes.coolant_temp = (value & 0xff) - 40;
          break;
        case 0x0c:
          attributes.rpm = value / 4;
          break;
        case 0x0d:
          attributes.obd_speed = value & 0xff;
          break;
        case 0x0f:
          attributes.intake_air_temp = (value & 0xff) - 40;
          break;
        case 0x11:
          attributes.throttle_position_percent = value / 2.55;
          break;
        case 0x2f:
          attributes.fuel_level = value / 2.55;
          break;
        case 0x31:
          attributes.trip_distance_km = value / 1000;
          break;
        case 0x42:
          attributes.control_module_voltage = value / 1000;
          break;
        case 0x5c:
          attributes.engine_oil_temp = (value & 0xff) - 40;
          break;
        default:
          break;
      }
    }
    if (rawGroups.length > 0) {
      attributes.eelink_obd_groups = rawGroups.map((group) => ({
        code: `0x${group.code.toString(16).toUpperCase().padStart(2, '0')}`,
        value: group.value,
      }));
    }
    return attributes;
  }

  private decodeStatus(status: number): Record<string, unknown> {
    const hasExternalCharging = (status & (1 << 7)) !== 0;
    const carDevice = (status & (1 << 1)) !== 0;
    return {
      gps_fix: (status & (1 << 0)) !== 0,
      ignition: carDevice ? (status & (1 << 2)) !== 0 : undefined,
      accelerometer_supported: (status & (1 << 3)) !== 0,
      motion_warning_enabled: (status & (1 << 4)) !== 0,
      relay_supported: (status & (1 << 5)) !== 0,
      relay_triggered: (status & (1 << 6)) !== 0,
      external_charging_supported: hasExternalCharging,
      charging: hasExternalCharging ? (status & (1 << 8)) !== 0 : undefined,
      device_active: (status & (1 << 9)) !== 0,
      gps_module_running: (status & (1 << 10)) !== 0,
      obd_module_running: (status & (1 << 11)) !== 0,
      din0: (status & (1 << 12)) !== 0,
      din1: (status & (1 << 13)) !== 0,
      din2: (status & (1 << 14)) !== 0,
      din3: (status & (1 << 15)) !== 0,
    };
  }

  private normalizeSignalLevel(level: number): number | undefined {
    if (level > 4) return undefined;
    return level / 4;
  }

  private decodeImei(buffer: Buffer): string {
    let out = '';
    for (const byte of buffer) {
      out += ((byte >> 4) & 0x0f).toString(10);
      out += (byte & 0x0f).toString(10);
    }
    return out.replace(/^0+/, '');
  }

  private parseUnixSeconds(seconds: number): Date {
    return new Date(seconds * 1000);
  }

  private formatVersion(value: number): string {
    const major = Math.floor(value / 100);
    const minor = value % 100;
    return `${major}.${minor.toString().padStart(2, '0')}`;
  }

  private formatMac(buffer: Buffer): string {
    return [...buffer].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(':');
  }

  private getPacketType(pid: number): EelinkPacketType {
    switch (pid) {
      case EelinkParser.PID_LOGIN:
        return 'login';
      case EelinkParser.PID_LOCATION_COMPACT:
        return 'location_compact';
      case EelinkParser.PID_HEARTBEAT:
        return 'heartbeat';
      case EelinkParser.PID_STATUS:
        return 'status';
      case EelinkParser.PID_PING:
        return 'ping';
      case EelinkParser.PID_LOCATION:
        return 'location';
      case EelinkParser.PID_WARNING:
        return 'warning';
      case EelinkParser.PID_REPORT:
        return 'report';
      case EelinkParser.PID_MESSAGE:
        return 'message';
      case EelinkParser.PID_COMMAND:
        return 'command_response';
      case EelinkParser.PID_OBD:
        return 'obd';
      case EelinkParser.PID_LBS:
        return 'lbs';
      default:
        return 'unknown';
    }
  }

  private invalid(error: string, pid = 0, size = 0): EelinkPacket {
    return {
      type: 'unknown',
      pid,
      size,
      sequence: 0,
      content: Buffer.alloc(0),
      valid: false,
      error,
    };
  }
}
