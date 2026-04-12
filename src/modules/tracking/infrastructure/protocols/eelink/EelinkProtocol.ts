import crypto from 'crypto';
import {
  DeviceTelemetryEvent,
  ProcessIncomingPositionUseCase,
} from '../../../application/use-cases';
import { EnsureTrackingDeviceUseCase } from '../../../application/use-cases/EnsureTrackingDeviceUseCase';
import { SendDeviceCommandUseCase } from '../../../application/use-cases/SendDeviceCommandUseCase';
import { deviceStateStore } from '../../device/DeviceStateStore';
import { deviceCommandStore } from '../../device/DeviceCommandStore';
import { liveDeviceConnectionRegistry } from '../../device/LiveDeviceConnectionRegistry';
import { eventDispatcher } from '../../../../../shared/utils';
import { protocolDebugLogger } from '../../../../../shared/protocolDebug/ProtocolDebugLogger';
import { EelinkParser, type EelinkPacket } from './EelinkParser';

export class EelinkProtocol {
  private parser = new EelinkParser();
  private logger: any;
  private imeiByConnection = new Map<number, string>();

  constructor(
    private processPositionUseCase: ProcessIncomingPositionUseCase,
    private ensureTrackingDeviceUseCase: EnsureTrackingDeviceUseCase,
    private sendDeviceCommandUseCase?: SendDeviceCommandUseCase,
    logger?: any,
  ) {
    this.logger = logger ?? console;
  }

  async handleMessage(buffer: Buffer, connectionId?: number): Promise<Buffer | null> {
    const packet = this.parser.parse(buffer);
    const messageType = `0x${packet.pid.toString(16).toUpperCase().padStart(2, '0')}`;

    if (!packet.valid) {
      protocolDebugLogger.log({
        protocol: 'eelink',
        direction: 'meta',
        kind: 'parse',
        connectionId,
        messageType,
        valid: false,
        error: packet.error,
      });
      this.logger.warn?.(`Invalid Eelink packet: ${packet.error}`);
      return null;
    }

    switch (packet.type) {
      case 'login':
        return this.handleLogin(packet, connectionId);
      case 'heartbeat':
      case 'status':
      case 'ping':
        return this.handleHeartbeat(packet, connectionId);
      case 'location_compact':
      case 'location':
      case 'warning':
      case 'report':
      case 'obd':
      case 'lbs':
        return this.handlePositionLike(packet, connectionId);
      case 'message':
        return this.handleMessagePacket(packet, connectionId);
      case 'command_response':
        return this.handleCommandResponse(packet, connectionId);
      default:
        protocolDebugLogger.log({
          protocol: 'eelink',
          direction: 'meta',
          kind: 'parse',
          connectionId,
          messageType,
          valid: true,
          action: 'unknown',
        });
        return null;
    }
  }

  private async handleLogin(packet: EelinkPacket, connectionId?: number): Promise<Buffer> {
    const imei = packet.data?.imei;
    const packetId = this.messageType(packet.pid);
    const attributes = this.withPacketSource(packet.data?.attributes ?? undefined, packetId);
    if (imei) {
      await this.ensureTrackingDeviceUseCase.execute(imei);
      if (connectionId != null) {
        this.imeiByConnection.set(connectionId, imei);
        liveDeviceConnectionRegistry.bindDevice('eelink', String(connectionId), imei);
      }
      this.pushDeviceState(imei, attributes);
      deviceStateStore.updatePacketAttributes(imei, packetId, attributes);
      await this.sendDeviceCommandUseCase?.flushPendingForImei('eelink', imei);
    }

    protocolDebugLogger.log({
      protocol: 'eelink',
      direction: 'meta',
      kind: 'parse',
      connectionId,
      messageType: this.messageType(packet.pid),
      imei,
      valid: true,
      action: 'login',
      details: {
        sequence: packet.sequence,
        attributes,
      },
    });

    return this.parser.buildLoginAck(packet.sequence);
  }

  private async handleHeartbeat(packet: EelinkPacket, connectionId?: number): Promise<Buffer> {
    const imei = this.resolveImei(packet, connectionId);
    const packetId = this.messageType(packet.pid);
    const attributes = this.withPacketSource(packet.data?.attributes ?? undefined, packetId);
    let deviceId: string | null = null;

    if (imei) {
      const device = await this.ensureTrackingDeviceUseCase.execute(imei);
      deviceId = device.id;
      this.pushDeviceState(imei, attributes);
      deviceStateStore.updatePacketAttributes(imei, packetId, attributes);
    }

    if (deviceId && attributes) {
      await eventDispatcher.dispatch(
        'device.telemetry',
        new DeviceTelemetryEvent(deviceId, deviceId, new Date(), attributes),
      );
    }

    protocolDebugLogger.log({
      protocol: 'eelink',
      direction: 'meta',
      kind: 'parse',
      connectionId,
      messageType: this.messageType(packet.pid),
      imei,
      valid: true,
      action: packet.type,
      details: {
        sequence: packet.sequence,
        attributes,
      },
    });

    return this.parser.buildAck(packet.pid, packet.sequence);
  }

  private async handlePositionLike(packet: EelinkPacket, connectionId?: number): Promise<Buffer | null> {
    const imei = this.resolveImei(packet, connectionId);
    const packetId = this.messageType(packet.pid);
    const attributes = this.withPacketSource(packet.data?.attributes ?? undefined, packetId);

    if (imei) {
      this.pushDeviceState(imei, attributes);
      deviceStateStore.updatePacketAttributes(imei, packetId, attributes);
    }

    let deviceId: string | null = null;
    if (imei) {
      const device = await this.ensureTrackingDeviceUseCase.execute(imei);
      deviceId = device.id;
    }

    if (
      imei &&
      packet.data?.timestamp instanceof Date &&
      typeof packet.data.latitude === 'number' &&
      typeof packet.data.longitude === 'number'
    ) {
      try {
        await this.processPositionUseCase.execute({
          deviceId: imei,
          receivedAt: new Date(),
          timestamp: packet.data.timestamp,
          latitude: packet.data.latitude,
          longitude: packet.data.longitude,
          speed: packet.data.speed,
          attributes,
        });
        protocolDebugLogger.log({
          protocol: 'eelink',
          direction: 'meta',
          kind: 'persist',
          connectionId,
          messageType: packetId,
          imei,
          valid: true,
          action: 'position_saved',
          details: {
            sequence: packet.sequence,
            timestamp: packet.data.timestamp.toISOString(),
            latitude: packet.data.latitude,
            longitude: packet.data.longitude,
            speed: packet.data.speed,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        protocolDebugLogger.log({
          protocol: 'eelink',
          direction: 'meta',
          kind: 'persist',
          connectionId,
          messageType: packetId,
          imei,
          valid: false,
          action: 'position_failed',
          error: message,
        });
        this.logger.error?.(`Failed to persist Eelink position: ${message}`);
      }
    }

    if (deviceId && attributes) {
      await eventDispatcher.dispatch(
        'device.telemetry',
        new DeviceTelemetryEvent(deviceId, deviceId, packet.data?.timestamp ?? new Date(), attributes),
      );
    }

    protocolDebugLogger.log({
      protocol: 'eelink',
      direction: 'meta',
      kind: 'parse',
      connectionId,
      messageType: packetId,
      imei,
      valid: true,
      action: packet.type,
      details: {
        sequence: packet.sequence,
        timestamp: packet.data?.timestamp instanceof Date ? packet.data.timestamp.toISOString() : undefined,
        latitude: packet.data?.latitude,
        longitude: packet.data?.longitude,
        speed: packet.data?.speed,
        attributes,
      },
    });

    if (packet.type === 'warning' || packet.type === 'report' || packet.type === 'obd') {
      return this.parser.buildAck(packet.pid, packet.sequence);
    }
    return null;
  }

  private async handleMessagePacket(packet: EelinkPacket, connectionId?: number): Promise<Buffer | null> {
    const imei = this.resolveImei(packet, connectionId);
    const packetId = this.messageType(packet.pid);
    const response = packet.data?.response?.trim() ?? '';
    const attributes = this.withPacketSource(packet.data?.attributes ?? undefined, packetId);

    if (imei) {
      this.pushDeviceState(imei, attributes);
      deviceStateStore.updatePacketAttributes(imei, packetId, attributes);
      if (response) {
        deviceCommandStore.attachLatestResponse('eelink', imei, response);
      }
    }

    protocolDebugLogger.log({
      protocol: 'eelink',
      direction: 'meta',
      kind: 'parse',
      connectionId,
      messageType: packetId,
      imei,
      valid: true,
      action: 'message',
      details: {
        sequence: packet.sequence,
        response,
        attributes,
      },
    });

    const phoneNumber = typeof packet.data?.attributes?.eelink_message_phone === 'string'
      ? packet.data.attributes.eelink_message_phone
      : '';
    return this.parser.buildMessageAck(packet.sequence, phoneNumber);
  }

  private resolveImei(packet: EelinkPacket, connectionId?: number): string | undefined {
    const imei = packet.data?.imei ?? (connectionId != null ? this.imeiByConnection.get(connectionId) : undefined);
    if (packet.data?.imei && connectionId != null) {
      this.imeiByConnection.set(connectionId, packet.data.imei);
      liveDeviceConnectionRegistry.bindDevice('eelink', String(connectionId), packet.data.imei);
    }
    return imei;
  }

  private async handleCommandResponse(packet: EelinkPacket, connectionId?: number): Promise<Buffer | null> {
    const imei = this.resolveImei(packet, connectionId);
    const packetId = this.messageType(packet.pid);
    const serverFlag = packet.data?.serverFlag;
    const response = packet.data?.response ?? '';
    const attributes = this.withPacketSource(packet.data?.attributes ?? undefined, packetId);

    if (imei) {
      this.pushDeviceState(imei, attributes);
      deviceStateStore.updatePacketAttributes(imei, packetId, attributes);
    }

    if (imei && typeof serverFlag === 'number') {
      deviceCommandStore.attachResponse('eelink', imei, serverFlag, response);
    }

    protocolDebugLogger.log({
      protocol: 'eelink',
      direction: 'meta',
      kind: 'parse',
      connectionId,
      messageType: packetId,
      imei,
      valid: true,
      action: 'command_response',
      details: {
        sequence: packet.sequence,
        serverFlag,
        response,
      },
    });

    return null;
  }

  private pushDeviceState(imei: string, attributes: Record<string, unknown> | null | undefined): void {
    deviceStateStore.updateProtocol(imei, 'eelink');
    deviceStateStore.updateLastSeen(imei, new Date());
    deviceStateStore.updateLastAttributes(imei, attributes);
    void eventDispatcher.dispatch('device.online', {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      aggregateId: imei,
      imei,
    } as any);
  }

  private messageType(pid: number): string {
    return `0x${pid.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  private withPacketSource(
    attributes: Record<string, unknown> | null | undefined,
    packetId: string,
  ): Record<string, unknown> | undefined {
    if (!attributes || Object.keys(attributes).length === 0) return undefined;
    return {
      ...attributes,
      tracking_protocol: 'eelink',
      tracking_packet_id: packetId,
    };
  }
}
