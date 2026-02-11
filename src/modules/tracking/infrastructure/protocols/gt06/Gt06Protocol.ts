import { Gt06Parser, type Gt06Packet } from './Gt06Parser';
import { ProcessIncomingPositionUseCase } from '../../application/use-cases';
import type { PositionRepository } from '../../domain/repositories';

/**
 * GT06 Protocol Handler
 * Routes incoming packets to appropriate handlers
 * Separates protocol layer from application layer
 */

export class Gt06Protocol {
  private parser: Gt06Parser;
  private positionUseCase: ProcessIncomingPositionUseCase;

  constructor(positionRepository: PositionRepository) {
    this.parser = new Gt06Parser();
    this.positionUseCase = new ProcessIncomingPositionUseCase(
      positionRepository,
    );
  }

  /**
   * Handle incoming GT06 message
   * @param buffer Raw bytes from device
   */
  async handleMessage(buffer: Buffer): Promise<void> {
    const packet = this.parser.parse(buffer);

    if (!packet.valid) {
      console.warn(`Invalid GT06 packet: ${packet.error}`);
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
        console.warn(
          `Unknown packet type: 0x${packet.messageType.toString(16)}`,
        );
    }
  }

  /**
   * Handle login message (device registration)
   */
  private async handleLogin(packet: Gt06Packet): Promise<void> {
    // TODO: Extract IMEI from payload
    // TODO: Validate device exists or create new device
    // TODO: Send login response
    console.log(`Login packet received (${packet.payload.length} bytes)`);
  }

  /**
   * Handle GPS location message
   */
  private async handleGps(packet: Gt06Packet): Promise<void> {
    try {
      const payload = packet.payload;

      // Validate GPS payload
      if (payload.length < 22) {
        console.warn(
          `Invalid GPS payload length: ${payload.length} (expected >= 22)`,
        );
        return;
      }

      const latitude = this.extractLatitude(payload);
      const longitude = this.extractLongitude(payload);
      const speed = this.extractSpeed(payload);
      const timestamp = this.extractTimestamp(payload);
      const deviceId = this.extractDeviceId(); // TODO: Extract from connection context

      if (deviceId !== 'unknown') {
        await this.positionUseCase.execute({
          deviceId,
          timestamp,
          latitude,
          longitude,
          speed,
        });
        console.log(
          `Position recorded for device ${deviceId}: (${latitude}, ${longitude})`,
        );
      } else {
        console.warn(
          'Cannot record position: device not authenticated (missing IMEI)',
        );
      }
    } catch (error) {
      console.error('Error processing GPS packet:', error);
    }
  }

  /**
   * Handle heartbeat message
   */
  private async handleHeartbeat(packet: Gt06Packet): Promise<void> {
    // TODO: Update device last-seen timestamp
    console.log(`Heartbeat packet received (${packet.payload.length} bytes)`);
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
