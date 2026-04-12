import { createServer, Server as NetServer, Socket } from 'net';
import crypto from 'crypto';
import { Gt06Protocol } from './Gt06Protocol';
import type { ProcessIncomingPositionUseCase } from '../../../application/use-cases/ProcessIncomingPositionUseCase';
import type { EnsureTrackingDeviceUseCase } from '../../../application/use-cases/EnsureTrackingDeviceUseCase';
import type { SendDeviceCommandUseCase } from '../../../application/use-cases/SendDeviceCommandUseCase';
import type { FastifyLoggerInstance } from 'fastify';
import { eventDispatcher } from '../../../../../shared/utils';
import { rawLogBuffer } from '../../../../../shared/rawLog/RawLogBuffer';
import { protocolDebugLogger } from '../../../../../shared/protocolDebug/ProtocolDebugLogger';
import { liveDeviceConnectionRegistry } from '../../device/LiveDeviceConnectionRegistry';

const SOCKET_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONNECTIONS = 2000;

/** Per-connection state: socket and accumulated TCP buffer for fragmented packets */
interface ConnectionState {
  socket: Socket;
  remoteAddr: string;
  buffer: Buffer;
}

/**
 * GT06 TCP Server
 * Accepts connections from GT06-compatible GPS trackers
 *
 * Default port: 5023
 * Protocol: Binary TCP
 *
 * Responsibility: Socket lifecycle only
 * Does NOT handle business logic (delegated to Gt06Protocol)
 * Supports fragmented/merged packets via per-socket buffer accumulation.
 */

export class Gt06Server {
  private protocol: Gt06Protocol;
  private port: number;
  private server: NetServer | null = null;
  /** Keyed by connectionId (number) to avoid remoteAddress:port reuse issues */
  private connections: Map<number, ConnectionState> = new Map();
  private connectionCounter: number = 0;
  private logger: FastifyLoggerInstance | Console;

  constructor(
    processPositionUseCase: ProcessIncomingPositionUseCase,
    ensureTrackingDeviceUseCase: EnsureTrackingDeviceUseCase,
    sendDeviceCommandUseCase: SendDeviceCommandUseCase | undefined,
    port: number = 5023,
    logger?: FastifyLoggerInstance,
  ) {
    this.port = port;
    this.logger = logger ?? console;
    this.protocol = new Gt06Protocol(processPositionUseCase, ensureTrackingDeviceUseCase, sendDeviceCommandUseCase, this.logger);
  }

  /**
   * Start GT06 server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        this.handleConnection(socket).catch((err: Error) => {
          this.logger.error?.('Connection handler error:', err);
        });
      });

      this.server.on('error', (err: Error) => {
        this.logger.error?.('GT06 server error:', err);
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        this.logger.info?.(`GT06 server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop GT06 server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    for (const state of this.connections.values()) {
      state.socket.destroy();
    }
    this.connections.clear();

    // Close server
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming connection from tracker
   */
  private async handleConnection(socket: Socket): Promise<void> {
    if (this.connections.size >= MAX_CONNECTIONS) {
      this.logger.warn?.(`[GT06] Max connections (${MAX_CONNECTIONS}) reached, rejecting`);
      socket.destroy();
      return;
    }

    const connectionId = ++this.connectionCounter;
    const remoteAddr = `${socket.remoteAddress ?? 'unknown'}:${socket.remotePort ?? 0}`;

    this.logger.info?.(`[GT06-${connectionId}] Connection from ${remoteAddr}`);
    protocolDebugLogger.log({
      protocol: 'gt06',
      direction: 'meta',
      kind: 'connect',
      port: this.port,
      remoteAddress: remoteAddr,
      connectionId,
      action: 'tcp_connect',
    });

    const state: ConnectionState = {
      socket,
      remoteAddr,
      buffer: Buffer.alloc(0),
    };
    this.connections.set(connectionId, state);
    liveDeviceConnectionRegistry.registerConnection('gt06', String(connectionId), async (payload) => {
      await new Promise<void>((resolve, reject) => {
        socket.write(payload, (error?: Error | null) => {
          if (error) reject(error);
          else resolve();
        });
      });
    });

    socket.setTimeout(SOCKET_IDLE_TIMEOUT_MS);
    socket.on('timeout', () => {
      this.logger.info?.(`[GT06-${connectionId}] Idle timeout, closing`);
      protocolDebugLogger.log({
        protocol: 'gt06',
        direction: 'meta',
        kind: 'close',
        port: this.port,
        remoteAddress: remoteAddr,
        connectionId,
        action: 'idle_timeout',
      });
      socket.destroy();
    });

    const onlineEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      aggregateId: remoteAddr,
      remoteAddr,
    } as any;
    void eventDispatcher.dispatch('device.online', onlineEvent);

    socket.on('data', async (data: Buffer) => {
      const chunkHex = data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
      rawLogBuffer.push({
        port: this.port,
        raw: chunkHex || data.toString('utf8', 0, 2000),
        kind: 'chunk',
        remoteAddress: remoteAddr,
      });
      protocolDebugLogger.log({
        protocol: 'gt06',
        direction: 'in',
        kind: 'chunk',
        port: this.port,
        remoteAddress: remoteAddr,
        connectionId,
        raw: chunkHex || data.toString('utf8', 0, 2000),
      });

      state.buffer = Buffer.concat([state.buffer, data]);
      const packets = this.extractPackets(state);
      for (const packet of packets) {
        const ack = await this.handleData(connectionId, remoteAddr, packet);
        if (ack && socket.writable) {
          try {
            const ackHex = ack.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
            this.logger.debug?.(`[GT06-${connectionId}] Sending ACK: ${ackHex}`);
            socket.write(ack);
            this.logger.debug?.(`[GT06-${connectionId}] ACK written to ${remoteAddr}`);
            protocolDebugLogger.log({
              protocol: 'gt06',
              direction: 'out',
              kind: 'ack',
              port: this.port,
              remoteAddress: remoteAddr,
              connectionId,
              messageType: `0x${ack[3].toString(16).toUpperCase().padStart(2, '0')}`,
              raw: ackHex,
            });
          } catch (e) {
            this.logger.error?.('Failed to write ACK to socket:', e);
          }
        }
      }
    });

    socket.on('end', () => {
      this.logger.info?.(`[GT06-${connectionId}] Connection closed by peer`);
      protocolDebugLogger.log({
        protocol: 'gt06',
        direction: 'meta',
        kind: 'close',
        port: this.port,
        remoteAddress: remoteAddr,
        connectionId,
        action: 'peer_end',
      });
    });

    socket.on('error', (err: Error) => {
      this.logger.error?.(`[GT06-${connectionId}] Socket error: ${err.message}`);
      protocolDebugLogger.log({
        protocol: 'gt06',
        direction: 'meta',
        kind: 'error',
        port: this.port,
        remoteAddress: remoteAddr,
        connectionId,
        action: 'socket_error',
        error: err.message,
      });
      this.connections.delete(connectionId);
      liveDeviceConnectionRegistry.unregisterConnection('gt06', String(connectionId));
    });

    socket.on('close', () => {
      this.logger.info?.(`[GT06-${connectionId}] Socket closed`);
      protocolDebugLogger.log({
        protocol: 'gt06',
        direction: 'meta',
        kind: 'close',
        port: this.port,
        remoteAddress: remoteAddr,
        connectionId,
        action: 'socket_closed',
      });
      this.connections.delete(connectionId);
      liveDeviceConnectionRegistry.unregisterConnection('gt06', String(connectionId));
      const offlineEvent = {
        eventId: crypto.randomUUID(),
        occurredAt: new Date(),
        aggregateId: remoteAddr,
        remoteAddr,
      } as any;
      void eventDispatcher.dispatch('device.offline', offlineEvent);
    });
  }

  /**
   * Extract full GT06 packets from per-connection buffer.
   * Standard 0x7878 packet format:
   * [0x78 0x78] [length:1] [type:1] [info:*] [serial:2] [crc:2] [0x0D 0x0A]
   * Full packet length = 2 + 1 + length + 2 = length + 5
   *
   * Extended 0x7979 packet format:
   * [0x79 0x79] [length:2] [type:1] [info:*] [serial:2] [crc:2] [0x0D 0x0A]
   * Full packet length = 2 + 2 + length + 2 = length + 6
   */
  private extractPackets(state: ConnectionState): Buffer[] {
    const packets: Buffer[] = [];
    const MIN_PACKET = 10;
    while (state.buffer.length >= MIN_PACKET) {
      const isStandard = state.buffer[0] === 0x78 && state.buffer[1] === 0x78;
      const isExtended = state.buffer[0] === 0x79 && state.buffer[1] === 0x79;
      if (!isStandard && !isExtended) {
        const lineEnd = state.buffer.indexOf(Buffer.from([0x0d, 0x0a]));
        if (lineEnd !== -1) {
          packets.push(state.buffer.subarray(0, lineEnd + 2));
          state.buffer = state.buffer.subarray(lineEnd + 2);
        } else {
          state.buffer = state.buffer.subarray(1);
        }
        continue;
      }
      const length = isExtended ? state.buffer.readUInt16BE(2) : state.buffer.readUInt8(2);
      const packetLen = isExtended ? length + 6 : length + 5;
      if (packetLen < MIN_PACKET || packetLen > 65536) {
        state.buffer = state.buffer.subarray(2);
        continue;
      }
      if (state.buffer.length < packetLen) break;
      packets.push(state.buffer.subarray(0, packetLen));
      state.buffer = state.buffer.subarray(packetLen);
    }
    return packets;
  }

  /**
   * Handle incoming data from tracker
   */
  private async handleData(
    connectionId: number,
    remoteAddr: string,
    data: Buffer,
  ): Promise<Buffer | null> {
    const hexString = data.toString('hex').toUpperCase();
    const hexFormatted = hexString.match(/.{1,2}/g)?.join(' ') || '';

    rawLogBuffer.push({
      port: this.port,
      raw: hexFormatted || data.toString('utf8', 0, 2000),
      kind: 'packet',
      remoteAddress: remoteAddr,
    });
    protocolDebugLogger.log({
      protocol: 'gt06',
      direction: 'in',
      kind: 'packet',
      port: this.port,
      remoteAddress: remoteAddr,
      connectionId,
      messageType: this.getMessageTypeHex(data),
      raw: hexFormatted || data.toString('utf8', 0, 2000),
    });

    this.logger.debug?.(
      `[GT06-${connectionId}] Received ${data.length} bytes from ${remoteAddr}`,
    );
    this.logger.debug?.(`[GT06-${connectionId}] HEX: ${hexFormatted}`);

    try {
      if (!((data[0] === 0x78 && data[1] === 0x78) || (data[0] === 0x79 && data[1] === 0x79))) {
        await this.protocol.handleTextResponse(data, connectionId);
        return null;
      }
      const ack = await this.protocol.handleMessage(data, connectionId);
      return ack ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error?.(`[GT06-${connectionId}] Error processing message: ${message}`);
      return null;
    }
  }

  private getMessageTypeHex(data: Buffer): string {
    const isExtended = data.length >= 5 && data[0] === 0x79 && data[1] === 0x79;
    const offset = isExtended ? 4 : 3;
    const value = data[offset] ?? 0;
    return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  /**
   * Get current connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server?.listening ?? false;
  }
}
