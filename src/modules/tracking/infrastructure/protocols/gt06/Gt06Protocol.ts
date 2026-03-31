import crypto from 'crypto';
import { Gt06Parser, type Gt06Packet } from './Gt06Parser';
import { buildAck } from './Gt06Acker';
import { ProcessIncomingPositionUseCase } from '../../../application/use-cases/ProcessIncomingPositionUseCase';
import { EnsureTrackingDeviceUseCase } from '../../../application/use-cases/EnsureTrackingDeviceUseCase';
import { deviceStateStore } from '../../device/DeviceStateStore';
import { liveDeviceConnectionRegistry } from '../../device/LiveDeviceConnectionRegistry';
import { eventDispatcher } from '../../../../../shared/utils';
import { protocolDebugLogger } from '../../../../../shared/protocolDebug/ProtocolDebugLogger';
import { DeviceTelemetryEvent } from '../../../application/use-cases';

/**
 * GT06 Protocol Handler
 * Routes incoming packets to appropriate handlers
 * Separates protocol layer from application layer
 */

export class Gt06Protocol {
  private parser: Gt06Parser;
  private logger: any;
  /** IMEI from login per connection, used for GPS when payload has no IMEI */
  private imeiByConnection: Map<number, string> = new Map();

  constructor(
    private processPositionUseCase: ProcessIncomingPositionUseCase,
    private ensureTrackingDeviceUseCase: EnsureTrackingDeviceUseCase,
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
        if (packet.data?.imei && connectionId != null) {
          this.imeiByConnection.set(connectionId, packet.data.imei);
          liveDeviceConnectionRegistry.bindDevice('gt06', String(connectionId), packet.data.imei);
        }
        if (packet.data?.imei) {
          deviceStateStore.updateProtocol(packet.data.imei, 'gt06');
          deviceStateStore.updateLastSeen(packet.data.imei, new Date());
          deviceStateStore.updateLastAttributes(packet.data.imei, packet.data.attributes ?? undefined);
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: packet.data.imei,
            imei: packet.data.imei,
          } as any);
        }
        protocolDebugLogger.log({
          protocol: 'gt06',
          direction: 'meta',
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
        const gpsImei = packet.data?.imei ?? (connectionId != null ? this.imeiByConnection.get(connectionId) : undefined);
        if (gpsImei) {
          deviceStateStore.updateProtocol(gpsImei, 'gt06');
          deviceStateStore.updateLastSeen(gpsImei, new Date());
          deviceStateStore.updateLastAttributes(gpsImei, packet.data?.attributes ?? undefined);
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
        const heartbeatImei = packet.data?.imei ?? heartbeatDevice?.imei ?? (connectionId != null ? this.imeiByConnection.get(connectionId) : undefined);
        if (packet.data?.imei && connectionId != null) {
          this.imeiByConnection.set(connectionId, packet.data.imei);
          liveDeviceConnectionRegistry.bindDevice('gt06', String(connectionId), packet.data.imei);
        }
        if (heartbeatImei) {
          deviceStateStore.updateProtocol(heartbeatImei, 'gt06');
          deviceStateStore.updateLastSeen(heartbeatImei, new Date());
          deviceStateStore.updateLastAttributes(heartbeatImei, packet.data?.attributes ?? undefined);
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: heartbeatImei,
            imei: heartbeatImei,
          } as any);
        }
        if (heartbeatDevice && packet.data?.attributes) {
          await eventDispatcher.dispatch(
            'device.telemetry',
            new DeviceTelemetryEvent(heartbeatDevice.id, heartbeatDevice.id, new Date(), packet.data.attributes),
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
        const infoImei = packet.data?.imei ?? infoDevice?.imei ?? (connectionId != null ? this.imeiByConnection.get(connectionId) : undefined);
        if (packet.data?.imei && connectionId != null) {
          this.imeiByConnection.set(connectionId, packet.data.imei);
          liveDeviceConnectionRegistry.bindDevice('gt06', String(connectionId), packet.data.imei);
        }
        if (infoImei) {
          deviceStateStore.updateProtocol(infoImei, 'gt06');
          deviceStateStore.updateLastSeen(infoImei, new Date());
          deviceStateStore.updateLastAttributes(infoImei, packet.data?.attributes ?? undefined);
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: infoImei,
            imei: infoImei,
          } as any);
        }
        if (infoDevice && packet.data?.attributes) {
          await eventDispatcher.dispatch(
            'device.telemetry',
            new DeviceTelemetryEvent(infoDevice.id, infoDevice.id, new Date(), packet.data.attributes),
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
      default:
        this.logger.warn?.(`Unknown packet type: 0x${packet.messageType.toString(16)}`);
        protocolDebugLogger.log({
          protocol: 'gt06',
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

  /**
   * Handle login message (device registration)
   */
  private async handleLogin(packet: Gt06Packet): Promise<void> {
    const imei = packet.data?.imei;
    if (imei) {
      deviceStateStore.updateProtocol(imei, 'gt06');
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

    const imei = decoded.imei ?? (connectionId != null ? this.imeiByConnection.get(connectionId) : undefined);
    const { latitude, longitude, speed, timestamp, attributes } = decoded;

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
    const imei = packet.data?.imei ?? (connectionId != null ? this.imeiByConnection.get(connectionId) : undefined);
    if (imei) {
      deviceStateStore.updateProtocol(imei, 'gt06');
      try {
        const device = await this.ensureTrackingDeviceUseCase.execute(imei);
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
    const imei = packet.data?.imei ?? (connectionId != null ? this.imeiByConnection.get(connectionId) : undefined);
    if (imei) {
      deviceStateStore.updateProtocol(imei, 'gt06');
      try {
        const device = await this.ensureTrackingDeviceUseCase.execute(imei);
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
}
