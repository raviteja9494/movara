import { Gt06Parser, type Gt06Packet } from './Gt06Parser';
import { buildAck } from './Gt06Acker';
import { ProcessIncomingPositionUseCase } from '../../application/use-cases/ProcessIncomingPositionUseCase';
import { deviceStateStore } from '../../device/DeviceStateStore';
import { eventDispatcher } from '../../../../../shared/utils';

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

  constructor(private processPositionUseCase: ProcessIncomingPositionUseCase, logger?: any) {
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

    if (!packet.valid) {
      this.logger.warn?.(`Invalid GT06 packet: ${packet.error}`);
      return null;
    }

    switch (packet.type) {
      case 'login':
        await this.handleLogin(packet);
        if (packet.data?.imei && connectionId != null) {
          this.imeiByConnection.set(connectionId, packet.data.imei);
        }
        if (packet.data?.imei) {
          const ts = packet.data.timestamp ? new Date(packet.data.timestamp) : new Date();
          deviceStateStore.updateLastSeen(packet.data.imei, ts);
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: packet.data.imei,
            imei: packet.data.imei,
          } as any);
        }
        return buildAck(packet.messageType);
      case 'gps':
        await this.handleGps(packet, connectionId);
        const gpsImei = packet.data?.imei ?? (connectionId != null ? this.imeiByConnection.get(connectionId) : undefined);
        if (gpsImei) {
          const ts = packet.data?.timestamp ? new Date(packet.data.timestamp) : new Date();
          deviceStateStore.updateLastSeen(gpsImei, ts);
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: gpsImei,
            imei: gpsImei,
          } as any);
        }
        return null;
      case 'heartbeat':
        await this.handleHeartbeat(packet);
        if (packet.data?.imei && connectionId != null) {
          this.imeiByConnection.set(connectionId, packet.data.imei);
        }
        if (packet.data?.imei) {
          deviceStateStore.updateLastSeen(packet.data.imei, new Date());
          void eventDispatcher.dispatch('device.online', {
            eventId: crypto.randomUUID(),
            occurredAt: new Date(),
            aggregateId: packet.data.imei,
            imei: packet.data.imei,
          } as any);
        }
        return buildAck(packet.messageType);
      default:
        this.logger.warn?.(`Unknown packet type: 0x${packet.messageType.toString(16)}`);
        return null;
    }
  }

  /**
   * Handle login message (device registration)
   */
  private async handleLogin(packet: Gt06Packet): Promise<void> {
    const imei = packet.data?.imei;
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
    const { latitude, longitude, speed, timestamp } = decoded;

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
          timestamp,
          latitude,
          longitude,
          speed,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error?.(`Failed to process incoming position: ${msg}`);
      }
    }
  }

  /**
   * Handle heartbeat message
   */
  private async handleHeartbeat(packet: Gt06Packet): Promise<void> {
    const imei = packet.data?.imei;
    this.logger.info?.(`Heartbeat packet received (${packet.payload.length} bytes) imei=${imei ?? 'unknown'}`);
  }

  /**
   * Build GT06 response packet
   * @param status Response status
   */
  buildResponse(_status: number): Buffer {
    // TODO: Implement response packet building
    return Buffer.alloc(0);
  }

  // ============= Payload Extraction Methods =============

  /**
   * Extract IMEI from connection context
   * TODO: Map socket to IMEI via device authentication
   */
  private extractDeviceId(): string {
    return 'unknown';
  }

  /**
   * Extract latitude from GPS payload (bytes 2-5, big-endian float)
   * TODO: Implement proper coordinate decoding
   */
  private extractLatitude(_payload: Buffer): number {
    return 0.0;
  }

  /**
   * Extract longitude from GPS payload (bytes 6-9, big-endian float)
   * TODO: Implement proper coordinate decoding
   */
  private extractLongitude(_payload: Buffer): number {
    return 0.0;
  }

  /**
   * Extract speed from GPS payload (bytes 10-11, big-endian uint16, km/h)
   * TODO: Parse speed bytes
   */
  private extractSpeed(_payload: Buffer): number {
    return 0;
  }

  /**
   * Extract timestamp from GPS payload (bytes 12-17, YY-MM-DD-HH-MM-SS format)
   * TODO: Parse BCD-encoded timestamp
   */
  private extractTimestamp(_payload: Buffer): Date {
    return new Date();
  }
}
