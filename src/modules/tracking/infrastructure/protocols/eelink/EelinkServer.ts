import crypto from 'crypto';
import { createServer, Server as NetServer, Socket } from 'net';
import type { FastifyLoggerInstance } from 'fastify';
import type { ProcessIncomingPositionUseCase } from '../../../application/use-cases/ProcessIncomingPositionUseCase';
import type { EnsureTrackingDeviceUseCase } from '../../../application/use-cases/EnsureTrackingDeviceUseCase';
import { eventDispatcher } from '../../../../../shared/utils';
import { rawLogBuffer } from '../../../../../shared/rawLog/RawLogBuffer';
import { protocolDebugLogger } from '../../../../../shared/protocolDebug/ProtocolDebugLogger';
import { EelinkProtocol } from './EelinkProtocol';

const SOCKET_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CONNECTIONS = 2000;

interface ConnectionState {
  socket: Socket;
  remoteAddr: string;
  buffer: Buffer;
}

export interface EelinkServerOptions {
  port?: number;
}

export class EelinkServer {
  private protocol: EelinkProtocol;
  private port: number;
  private logger: FastifyLoggerInstance | Console;
  private server: NetServer | null = null;
  private connections = new Map<number, ConnectionState>();
  private connectionCounter = 0;

  constructor(
    processPositionUseCase: ProcessIncomingPositionUseCase,
    ensureTrackingDeviceUseCase: EnsureTrackingDeviceUseCase,
    options: EelinkServerOptions = {},
    logger?: FastifyLoggerInstance,
  ) {
    this.port = options.port ?? 5064;
    this.logger = logger ?? console;
    this.protocol = new EelinkProtocol(processPositionUseCase, ensureTrackingDeviceUseCase, this.logger);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.createProtocolServer();
      } catch (error) {
        reject(error);
        return;
      }

      this.server.on('error', (err: Error) => {
        this.logger.error?.('Eelink server error:', err);
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        this.logger.info?.(`Eelink server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    for (const state of this.connections.values()) {
      state.socket.destroy();
    }
    this.connections.clear();
    return new Promise((resolve, reject) => {
      this.server?.close((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private createProtocolServer(): NetServer {
    return createServer((socket) => {
      this.handleConnection(socket).catch((err: Error) => {
        this.logger.error?.('Eelink connection handler error:', err);
      });
    });
  }

  private async handleConnection(socket: Socket): Promise<void> {
    if (this.connections.size >= MAX_CONNECTIONS) {
      this.logger.warn?.(`[Eelink] Max connections (${MAX_CONNECTIONS}) reached, rejecting`);
      socket.destroy();
      return;
    }

    const connectionId = ++this.connectionCounter;
    const remoteAddr = `${socket.remoteAddress ?? 'unknown'}:${socket.remotePort ?? 0}`;
    this.connections.set(connectionId, {
      socket,
      remoteAddr,
      buffer: Buffer.alloc(0),
    });
    rawLogBuffer.push({
      port: this.port,
      raw: 'Client connected',
      kind: 'connect',
      remoteAddress: remoteAddr,
    });
    protocolDebugLogger.log({
      protocol: 'eelink',
      direction: 'meta',
      kind: 'connect',
      port: this.port,
      remoteAddress: remoteAddr,
      connectionId,
      action: 'tcp_connect',
    });

    socket.setTimeout(SOCKET_IDLE_TIMEOUT_MS);
    socket.on('timeout', () => {
      this.logger.info?.(`[Eelink-${connectionId}] Idle timeout, closing`);
      socket.destroy();
    });

    void eventDispatcher.dispatch('device.online', {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      aggregateId: remoteAddr,
      remoteAddr,
    } as any);

    socket.on('data', async (data: Buffer) => {
      const chunkHex = this.toHex(data);
      rawLogBuffer.push({
        port: this.port,
        raw: chunkHex || data.toString('utf8', 0, 2000),
        kind: 'chunk',
        remoteAddress: remoteAddr,
      });
      protocolDebugLogger.log({
        protocol: 'eelink',
        direction: 'in',
        kind: 'chunk',
        port: this.port,
        remoteAddress: remoteAddr,
        connectionId,
        raw: chunkHex || data.toString('utf8', 0, 2000),
      });

      const state = this.connections.get(connectionId);
      if (!state) return;

      state.buffer = Buffer.concat([state.buffer, data]);
      const packets = this.extractPackets(state);
      for (const packet of packets) {
        const response = await this.handlePacket(packet, connectionId, remoteAddr);
        if (response && socket.writable) {
          socket.write(response);
          protocolDebugLogger.log({
            protocol: 'eelink',
            direction: 'out',
            kind: 'ack',
            port: this.port,
            remoteAddress: remoteAddr,
            connectionId,
            messageType: `0x${response[2].toString(16).toUpperCase().padStart(2, '0')}`,
            raw: this.toHex(response),
          });
        }
      }
    });

    socket.on('close', () => {
      this.connections.delete(connectionId);
      protocolDebugLogger.log({
        protocol: 'eelink',
        direction: 'meta',
        kind: 'close',
        port: this.port,
        remoteAddress: remoteAddr,
        connectionId,
        action: 'socket_closed',
      });
      void eventDispatcher.dispatch('device.offline', {
        eventId: crypto.randomUUID(),
        occurredAt: new Date(),
        aggregateId: remoteAddr,
        remoteAddr,
      } as any);
    });

    socket.on('error', (error: Error) => {
      this.logger.error?.(`[Eelink-${connectionId}] Socket error: ${error.message}`);
      this.connections.delete(connectionId);
      rawLogBuffer.push({
        port: this.port,
        raw: error.message,
        kind: 'socket-error',
        remoteAddress: remoteAddr,
      });
      protocolDebugLogger.log({
        protocol: 'eelink',
        direction: 'meta',
        kind: 'socket-error',
        port: this.port,
        remoteAddress: remoteAddr,
        connectionId,
        valid: false,
        error: error.message,
        action: 'socket_error',
      });
    });
  }

  private extractPackets(state: ConnectionState): Buffer[] {
    const packets: Buffer[] = [];
    while (state.buffer.length >= 7) {
      if (state.buffer[0] !== 0x67 || state.buffer[1] !== 0x67) {
        state.buffer = state.buffer.subarray(1);
        continue;
      }
      const size = state.buffer.readUInt16BE(3);
      const packetLength = 5 + size;
      if (packetLength < 7 || packetLength > 65536) {
        state.buffer = state.buffer.subarray(2);
        continue;
      }
      if (state.buffer.length < packetLength) break;
      packets.push(state.buffer.subarray(0, packetLength));
      state.buffer = state.buffer.subarray(packetLength);
    }
    return packets;
  }

  private async handlePacket(packet: Buffer, connectionId: number, remoteAddr: string): Promise<Buffer | null> {
    const raw = this.toHex(packet);
    rawLogBuffer.push({
      port: this.port,
      raw,
      kind: 'packet',
      remoteAddress: remoteAddr,
    });
    protocolDebugLogger.log({
      protocol: 'eelink',
      direction: 'in',
      kind: 'packet',
      port: this.port,
      remoteAddress: remoteAddr,
      connectionId,
      messageType: `0x${packet[2].toString(16).toUpperCase().padStart(2, '0')}`,
      raw,
    });
    return this.protocol.handleMessage(packet, connectionId);
  }

  private toHex(data: Buffer): string {
    return data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
  }
}
