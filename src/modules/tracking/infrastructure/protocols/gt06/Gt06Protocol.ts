import crypto from 'crypto';
import { Gt06Parser, type Gt06Packet } from './Gt06Parser';
import { buildAck } from './Gt06Acker';
import { ProcessIncomingPositionUseCase } from '../../../application/use-cases/ProcessIncomingPositionUseCase';
import { EnsureTrackingDeviceUseCase } from '../../../application/use-cases/EnsureTrackingDeviceUseCase';
import type { DeviceStateStore } from '../../device/DeviceStateStore';
import type { DeviceCommandStore } from '../../device/DeviceCommandStore';
import type { LiveDeviceConnectionRegistry } from '../../device/LiveDeviceConnectionRegistry';
import { eventDispatcher } from '../../../../../shared/utils';
import { protocolDebugLogger } from '../../../../../shared/protocolDebug/ProtocolDebugLogger';
import { DeviceTelemetryEvent } from '../../../application/use-cases';
import { SendDeviceCommandUseCase } from '../../../application/use-cases/SendDeviceCommandUseCase';

/**
 * GT06 Protocol Handler
 * Routes incoming packets to appropriate handlers
 * Separates protocol layer from application layer
 */

export class Gt06Protocol {
  private parser: Gt06Parser;
  private logger: any;
  constructor(
    private processPositionUseCase: ProcessIncomingPositionUseCase,
    private ensureTrackingDeviceUseCase: EnsureTrackingDeviceUseCase,
    private deviceStateStore: DeviceStateStore,
    private deviceCommandStore: DeviceCommandStore,
    private liveDeviceConnectionRegistry: LiveDeviceConnectionRegistry,
    private sendDeviceCommandUseCase?: SendDeviceCommandUseCase,
    logger?: any,
  ) {
    this.parser = new Gt06Parser();
    this.logger = logger ?? console;
  }

  /**
   * Handle incoming message and optionally return an ACK buffer to send back.
   * @param buffer Raw bytes from device
   * @param connectionId Optional; when set, login IMEI is stored and used for GPS on this connection
   */
  async handleMessage(buffer: Buffer, connectionId?: number): Promise<Buffer | null> {
    const packet = this.parser.parse(buffer);
    const messageType = `0x${packet.messageType.toString(16).toUpperCase().padStart(2, '0')}`;

    if (!packet.valid) {
      this.logger.warn?.(`Invalid GT06 packet: ${packet.error}`);
      protocolDebugLogger.log({
        protocol: 'gt06',
        direction: 'meta',
        kind: 'parse',
        connectionId,
        messageType,
        valid: false,
        error: packet.error,
      });
      return null;
    }

    switch (packet.type) {
      case 'login':
        await this.handleLogin(packet);
        const loginAttributes = this.withPacketSource(packet.data?.attributes ?? undefined, messageType);
        if (packet.data?.imei && connectionId != null) {
          this.liveDeviceConnectionRegistry.bindDevice('gt06', String(connectionId), packet.data.imei);
        }
        if (packet.data?.imei) {
          await this.deviceStateStore.updateProtocol(packet.data.imei, 'gt06');
          await this.deviceStateStore.updateLastSeen(packet.data.imei, new Date());
          await this.deviceStateStore.updateLastAttributes(packet.data.imei, loginAttributes);
          await this.deviceStateStore.updatePacketAttributes(packet.data.imei, messageType, loginAttributes);
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: packet.data.imei,
            imei: packet.data.imei,
          } as any);
          await this.sendDeviceCommandUseCase?.flushPendingForImei('gt06', packet.data.imei);
        }
        protocolDebugLogger.log({
          protocol: 'gt06',
          direction: 'in',
          kind: 'parse',
          connectionId,
          messageType,
          imei: packet.data?.imei,
          valid: true,
          action: 'login',
          details: {
            serialNumber: packet.serialNumber,
          },
        });
        return buildAck(packet.messageType, packet.serialNumber);
      case 'gps':
        await this.handleGps(packet, connectionId);
        const gpsImei = packet.data?.imei ?? (connectionId != null ? this.liveDeviceConnectionRegistry.getBoundDevice('gt06', String(connectionId)) : undefined);
        const gpsAttributes = this.withPacketSource(packet.data?.attributes ?? undefined, messageType);
        if (gpsImei) {
          await this.deviceStateStore.updateProtocol(gpsImei, 'gt06');
          await this.deviceStateStore.updateLastSeen(gpsImei, new Date());
          await this.deviceStateStore.updateLastAttributes(gpsImei, gpsAttributes);
          await this.deviceStateStore.updatePacketAttributes(gpsImei, messageType, gpsAttributes);
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: gpsImei,
            imei: gpsImei,
          } as any);
        }
        protocolDebugLogger.log({
          protocol: 'gt06',
          direction: 'meta',
          kind: 'parse',
          connectionId,
          messageType,
          imei: gpsImei,
          valid: true,
          action: 'gps',
          details: {
            serialNumber: packet.serialNumber,
            timestamp: packet.data?.timestamp instanceof Date ? packet.data.timestamp.toISOString() : undefined,
            latitude: packet.data?.latitude,
            longitude: packet.data?.longitude,
            speed: packet.data?.speed,
            attributes: packet.data?.attributes ?? undefined,
          },
        });
        return null;
      case 'heartbeat':
        const heartbeatDevice = await this.handleHeartbeat(packet, connectionId);
        const heartbeatImei = packet.data?.imei ?? heartbeatDevice?.imei ?? (connectionId != null ? this.liveDeviceConnectionRegistry.getBoundDevice('gt06', String(connectionId)) : undefined);
        const heartbeatAttributes = this.withPacketSource(packet.data?.attributes ?? undefined, messageType);
        if (packet.data?.imei && connectionId != null) {
          this.liveDeviceConnectionRegistry.bindDevice('gt06', String(connectionId), packet.data.imei);
        }
        if (heartbeatImei) {
          await this.deviceStateStore.updateProtocol(heartbeatImei, 'gt06');
          await this.deviceStateStore.updateLastSeen(heartbeatImei, new Date());
          await this.deviceStateStore.updateLastAttributes(heartbeatImei, heartbeatAttributes);
          await this.deviceStateStore.updatePacketAttributes(heartbeatImei, messageType, heartbeatAttributes);
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: heartbeatImei,
            imei: heartbeatImei,
          } as any);
        }
        if (heartbeatDevice && heartbeatAttributes) {
          await eventDispatcher.dispatch(
            'device.telemetry',
            new DeviceTelemetryEvent(heartbeatDevice.id, heartbeatDevice.id, new Date(), heartbeatAttributes),
          );
        }
        protocolDebugLogger.log({
          protocol: 'gt06',
          direction: 'meta',
          kind: 'parse',
          connectionId,
          messageType,
          imei: heartbeatImei,
          valid: true,
          action: 'heartbeat',
          details: {
            serialNumber: packet.serialNumber,
            attributes: packet.data?.attributes ?? undefined,
          },
        });
        return buildAck(packet.messageType, packet.serialNumber);
      case 'info':
        const infoDevice = await this.handleInfo(packet, connectionId);
        const infoImei = packet.data?.imei ?? infoDevice?.imei ?? (connectionId != null ? this.liveDeviceConnectionRegistry.getBoundDevice('gt06', String(connectionId)) : undefined);
        const infoAttributes = this.withPacketSource(packet.data?.attributes ?? undefined, messageType);
        if (packet.data?.imei && connectionId != null) {
          this.liveDeviceConnectionRegistry.bindDevice('gt06', String(connectionId), packet.data.imei);
        }
        if (infoImei) {
          await this.deviceStateStore.updateProtocol(infoImei, 'gt06');
          await this.deviceStateStore.updateLastSeen(infoImei, new Date());
          await this.deviceStateStore.updateLastAttributes(infoImei, infoAttributes);
          await this.deviceStateStore.updatePacketAttributes(infoImei, messageType, infoAttributes);
          const reportText = typeof packet.data?.attributes?.gt06_report_text === 'string'
            ? packet.data.attributes.gt06_report_text
            : null;
          if (reportText) {
            await this.deviceCommandStore.attachLatestResponse('gt06', infoImei, reportText);
          }
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: infoImei,
            imei: infoImei,
          } as any);
        }
        if (infoDevice && infoAttributes) {
          await eventDispatcher.dispatch(
            'device.telemetry',
            new DeviceTelemetryEvent(infoDevice.id, infoDevice.id, new Date(), infoAttributes),
          );
        }
        protocolDebugLogger.log({
          protocol: 'gt06',
          direction: 'meta',
          kind: 'parse',
          connectionId,
          messageType,
          imei: infoImei,
          valid: true,
          action: 'info',
          details: {
            serialNumber: packet.serialNumber,
            attributes: packet.data?.attributes ?? undefined,
          },
        });
        return null;
      case 'command_response':
        return this.handleCommandResponse(packet, connectionId);
      default:
        this.logger.warn?.(`Unknown packet type: 0x${packet.messageType.toString(16)}`);
        protocolDebugLogger.log({
          protocol: 'gt06',
          direction: 'in',
          kind: 'parse',
          connectionId,
          messageType,
          valid: true,
          action: 'unknown',
          raw: this.toHex(buffer),
          details: { length: buffer.length },
        });
        return null;
    }
  }

  async handleTextResponse(buffer: Buffer, connectionId?: number): Promise<void> {
    const imei = connectionId != null ? this.liveDeviceConnectionRegistry.getBoundDevice('gt06', String(connectionId)) : undefined;
    const response = buffer.toString('utf8').replace(/\0+$/g, '').trim();
    if (!imei || !response) return;
    await this.deviceCommandStore.attachLatestResponse('gt06', imei, response);
    protocolDebugLogger.log({
      protocol: 'gt06',
      direction: 'meta',
      kind: 'parse',
      connectionId,
      imei,
      valid: true,
      action: 'command_response_text',
      details: {
        response,
      },
    });
  }

  /**
   * Handle login message (device registration)
   */
  private async handleLogin(packet: Gt06Packet): Promise<void> {
    const imei = packet.data?.imei;
    if (imei) {
      await this.deviceStateStore.updateProtocol(imei, 'gt06');
      try {
        await this.ensureTrackingDeviceUseCase.execute(imei);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error?.(`Failed to ensure GT06 device on login: ${msg}`);
      }
    }
    this.logger.info?.(`Login packet received (${packet.payload.length} bytes) imei=${imei ?? 'unknown'}`);
  }

  /**
   * Handle GPS location message. Uses IMEI from decoded payload or from login (per connection).
   */
  private async handleGps(packet: Gt06Packet, connectionId?: number): Promise<void> {
    const decoded = packet.data;
    if (!decoded) {
      this.logger.warn?.('GPS packet received but no decoded data available');
      return;
    }

    const imei = decoded.imei ?? (connectionId != null ? this.liveDeviceConnectionRegistry.getBoundDevice('gt06', String(connectionId)) : undefined);
    const packetId = `0x${packet.messageType.toString(16).toUpperCase().padStart(2, '0')}`;
    const { latitude, longitude, speed, timestamp } = decoded;
    const attributes = this.withPacketSource(decoded.attributes ?? undefined, packetId);

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      this.logger.info?.(
        `GPS packet decoded imei=${imei ?? 'unknown'} lat=${latitude} lon=${longitude} speed=${speed ?? 'n/a'} time=${timestamp?.toISOString() ?? 'n/a'}`,
      );
    } else {
      this.logger.warn?.('GPS packet decoded but missing coordinates');
    }
    if (imei && typeof latitude === 'number' && typeof longitude === 'number' && timestamp instanceof Date) {
      try {
        await this.processPositionUseCase.execute({
          deviceId: imei,
          receivedAt: new Date(),
          timestamp,
          latitude,
          longitude,
          speed,
          attributes: attributes ?? undefined,
        });
        protocolDebugLogger.log({
          protocol: 'gt06',
          direction: 'meta',
          kind: 'persist',
          connectionId,
          messageType: `0x${packet.messageType.toString(16).toUpperCase().padStart(2, '0')}`,
          imei,
          valid: true,
          action: 'position_saved',
          details: {
            timestamp: timestamp.toISOString(),
            latitude,
            longitude,
            speed,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error?.(`Failed to process incoming position: ${msg}`);
        protocolDebugLogger.log({
          protocol: 'gt06',
          direction: 'meta',
          kind: 'persist',
          connectionId,
          messageType: `0x${packet.messageType.toString(16).toUpperCase().padStart(2, '0')}`,
          imei,
          valid: false,
          action: 'position_failed',
          error: msg,
          details: {
            timestamp: timestamp.toISOString(),
            latitude,
            longitude,
            speed,
          },
        });
      }
    }
  }

  /**
   * Handle heartbeat message
   */
  private async handleHeartbeat(packet: Gt06Packet, connectionId?: number): Promise<{ id: string; imei: string } | null> {
    const imei = packet.data?.imei ?? (connectionId != null ? this.liveDeviceConnectionRegistry.getBoundDevice('gt06', String(connectionId)) : undefined);
    if (imei) {
      await this.deviceStateStore.updateProtocol(imei, 'gt06');
      try {
        const device = await this.ensureTrackingDeviceUseCase.execute(imei);
        await this.sendDeviceCommandUseCase?.flushPendingForImei('gt06', imei);
        this.logger.info?.(`Heartbeat packet received (${packet.payload.length} bytes) imei=${imei ?? 'unknown'}`);
        return { id: device.id, imei: device.imei };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error?.(`Failed to ensure GT06 device on heartbeat: ${msg}`);
      }
    }
    this.logger.info?.(`Heartbeat packet received (${packet.payload.length} bytes) imei=${imei ?? 'unknown'}`);
    return null;
  }

  private async handleInfo(packet: Gt06Packet, connectionId?: number): Promise<{ id: string; imei: string } | null> {
    const imei = packet.data?.imei ?? (connectionId != null ? this.liveDeviceConnectionRegistry.getBoundDevice('gt06', String(connectionId)) : undefined);
    if (imei) {
      await this.deviceStateStore.updateProtocol(imei, 'gt06');
      try {
        const device = await this.ensureTrackingDeviceUseCase.execute(imei);
        await this.sendDeviceCommandUseCase?.flushPendingForImei('gt06', imei);
        this.logger.info?.(`Info packet received type=0x${packet.messageType.toString(16)} imei=${imei ?? 'unknown'}`);
        return { id: device.id, imei: device.imei };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error?.(`Failed to ensure GT06 device on info packet: ${msg}`);
      }
    }
    this.logger.info?.(`Info packet received type=0x${packet.messageType.toString(16)} imei=${imei ?? 'unknown'}`);
    return null;
  }

  /**
   * Build GT06 response packet (e.g. for config/command responses).
   * Login and heartbeat ACKs use buildAck() in Gt06Acker instead.
   */
  buildResponse(_status: number): Buffer {
    return Buffer.alloc(0);
  }

  private async handleCommandResponse(packet: Gt06Packet, connectionId?: number): Promise<Buffer | null> {
    const imei = packet.data?.imei ?? (connectionId != null ? this.liveDeviceConnectionRegistry.getBoundDevice('gt06', String(connectionId)) : undefined);
    const messageType = `0x${packet.messageType.toString(16).toUpperCase().padStart(2, '0')}`;
    const response = packet.data?.response?.trim() ?? '';
    const attributes = this.withPacketSource(packet.data?.attributes ?? undefined, messageType);

    if (imei) {
      await this.deviceStateStore.updateProtocol(imei, 'gt06');
      await this.deviceStateStore.updateLastSeen(imei, new Date());
      await this.deviceStateStore.updateLastAttributes(imei, attributes);
      await this.deviceStateStore.updatePacketAttributes(imei, messageType, attributes);
      if (response) {
        await this.deviceCommandStore.attachLatestResponse('gt06', imei, response);
      }
    }

    protocolDebugLogger.log({
      protocol: 'gt06',
      direction: 'meta',
      kind: 'parse',
      connectionId,
      messageType,
      imei,
      valid: true,
      action: 'command_response',
      details: {
        serialNumber: packet.serialNumber,
        response,
        attributes,
      },
    });

    if (packet.messageType === 0x15) {
      return buildAck(packet.messageType, packet.serialNumber);
    }
    return null;
  }

  private withPacketSource(
    attributes: Record<string, unknown> | null | undefined,
    packetId: string,
  ): Record<string, unknown> | undefined {
    if (!attributes || Object.keys(attributes).length === 0) return undefined;
    return {
      ...attributes,
      tracking_protocol: 'gt06',
      tracking_packet_id: packetId,
    };
  }

  private toHex(data: Buffer): string {
    return data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
  }
}
