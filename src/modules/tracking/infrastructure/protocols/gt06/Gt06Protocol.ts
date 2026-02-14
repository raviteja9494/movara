import { Gt06Parser, type Gt06Packet } from './Gt06Parser';
import type { PositionRepository } from '../../domain/repositories';

/**
 * GT06 Protocol Handler
 * Routes incoming packets to appropriate handlers
 * Separates protocol layer from application layer
 */

export class Gt06Protocol {
  private parser: Gt06Parser;
  private logger: any;

  constructor(_positionRepository: PositionRepository, logger?: any) {
    this.parser = new Gt06Parser();
    // Parser only: no DB logic here. Persistence will be added after authentication.
    this.logger = logger ?? console;
  }

  /**
   * Handle incoming GT06 message
   * @param buffer Raw bytes from device
   */
  async handleMessage(buffer: Buffer): Promise<void> {
    const packet = this.parser.parse(buffer);

    if (!packet.valid) {
      this.logger.warn?.(`Invalid GT06 packet: ${packet.error}`);
      return;
    }

    switch (packet.type) {
      case 'login':
        await this.handleLogin(packet);
        break;
      case 'gps':
        await this.handleGps(packet);
        break;
      case 'heartbeat':
        await this.handleHeartbeat(packet);
        break;
      default:
        this.logger.warn?.(
          `Unknown packet type: 0x${packet.messageType.toString(16)}`,
        );
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
   * Handle GPS location message
   */
  private async handleGps(packet: Gt06Packet): Promise<void> {
    // Parser now provides a decoded DTO when possible. No DB logic here.
    const decoded = packet.data;
    if (!decoded) {
      this.logger.warn?.('GPS packet received but no decoded data available');
      return;
    }

    const { imei, latitude, longitude, speed, timestamp } = decoded;

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      this.logger.info?.(
        `GPS packet decoded imei=${imei ?? 'unknown'} lat=${latitude} lon=${longitude} speed=${speed ?? 'n/a'} time=${timestamp?.toISOString() ?? 'n/a'}`,
      );
    } else {
      this.logger.warn?.('GPS packet decoded but missing coordinates');
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
