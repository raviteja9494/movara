import { createServer, Server as NetServer, Socket } from 'net';
import { Gt06Protocol } from './Gt06Protocol';
import type { ProcessIncomingPositionUseCase } from '../../../application/use-cases/ProcessIncomingPositionUseCase';
import type { FastifyLoggerInstance } from 'fastify';
import { eventDispatcher } from '../../../../../shared/utils';

/**
 * GT06 TCP Server
 * Accepts connections from GT06-compatible GPS trackers
 * 
 * Default port: 5051
 * Protocol: Binary TCP
 * 
 * Responsibility: Socket lifecycle only
 * Does NOT handle business logic (delegated to Gt06Protocol)
 */

export class Gt06Server {
  private protocol: Gt06Protocol;
  private port: number;
  private server: NetServer | null = null;
  private connections: Map<string, Socket> = new Map();
  private connectionCounter: number = 0;
  private logger: FastifyLoggerInstance | Console;

  constructor(
    processPositionUseCase: ProcessIncomingPositionUseCase,
    port: number = 5051,
    logger?: FastifyLoggerInstance,
  ) {
    this.port = port;
    this.logger = logger ?? console;
    this.protocol = new Gt06Protocol(processPositionUseCase, this.logger);
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

    // Close all client connections
    for (const socket of this.connections.values()) {
      socket.destroy();
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
    const connectionId = ++this.connectionCounter;
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;

    this.logger.info?.(`[GT06-${connectionId}] Connection from ${remoteAddr}`);

    this.connections.set(remoteAddr, socket);

    // Emit device.online event (fire-and-forget)
    const onlineEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      aggregateId: remoteAddr,
      remoteAddr,
    } as any;
    void eventDispatcher.dispatch('device.online', onlineEvent);

    socket.on('data', async (data: Buffer) => {
      const ack = await this.handleData(connectionId, remoteAddr, data);
      if (ack && socket.writable) {
        try {
          // Log ACK being sent (hex)
          try {
            const ackHex = ack.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
            this.logger.debug?.(`[GT06-${connectionId}] Sending ACK to ${remoteAddr}: ${ackHex}`);
          } catch {}

          socket.write(ack);
          this.logger.info?.(`[GT06-${connectionId}] ACK written to ${remoteAddr}`);
        } catch (e) {
          this.logger.error?.('Failed to write ACK to socket:', e);
        }
      }
    });

    socket.on('end', () => {
      this.logger.info?.(`[GT06-${connectionId}] Connection closed by peer`);
      this.connections.delete(remoteAddr);
      const offlineEvent = {
        eventId: crypto.randomUUID(),
        occurredAt: new Date(),
        aggregateId: remoteAddr,
        remoteAddr,
      } as any;
      void eventDispatcher.dispatch('device.offline', offlineEvent);
    });

    socket.on('error', (err: Error) => {
      this.logger.error?.(`[GT06-${connectionId}] Socket error: ${err.message}`);
      this.connections.delete(remoteAddr);
    });

    socket.on('close', () => {
      this.logger.info?.(`[GT06-${connectionId}] Socket closed`);
      this.connections.delete(remoteAddr);
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
   * Handle incoming data from tracker
   */
  private async handleData(
    connectionId: number,
    remoteAddr: string,
    data: Buffer,
  ): Promise<Buffer | null> {
    const hexString = data.toString('hex').toUpperCase();
    const hexFormatted = hexString.match(/.{1,2}/g)?.join(' ') || '';

    this.logger.debug?.(
      `[GT06-${connectionId}] Received ${data.length} bytes from ${remoteAddr}`,
    );
    this.logger.debug?.(`[GT06-${connectionId}] HEX: ${hexFormatted}`);

    try {
      const ack = await this.protocol.handleMessage(data, connectionId);
      return ack ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error?.(`[GT06-${connectionId}] Error processing message: ${message}`);
      return null;
    }
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
    return this.server !== null && !this.server.listening === false;
  }
}
