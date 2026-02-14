import http from 'http';
import type { ProcessIncomingPositionUseCase } from '../../../application/use-cases/ProcessIncomingPositionUseCase';
import type { FastifyLoggerInstance } from 'fastify';

/**
 * OsmAnd protocol HTTP server (Traccar-compatible).
 * Accepts GET or POST with query/form params: id or deviceid, lat, lon, timestamp (optional), speed (optional).
 * Used by Traccar Client, OsmAnd live tracking, and other apps that support OsmAnd protocol.
 * Default port: 5055
 * @see https://www.traccar.org/osmand/
 */
export class OsmAndServer {
  private processPosition: ProcessIncomingPositionUseCase;
  private port: number;
  private server: http.Server | null = null;
  private logger: FastifyLoggerInstance | Console;

  constructor(
    processPositionUseCase: ProcessIncomingPositionUseCase,
    port: number = 5055,
    logger?: FastifyLoggerInstance,
  ) {
    this.processPosition = processPositionUseCase;
    this.port = port;
    this.logger = logger ?? console;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          this.logger.error?.({ err }, 'OsmAnd request error');
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Error');
        });
      });

      this.server.on('error', (err: Error) => {
        this.logger.error?.({ err }, 'OsmAnd server error');
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        this.logger.info?.(`OsmAnd protocol server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve, reject) => {
      this.server!.close((err?: Error) => {
        if (err) reject(err);
        else resolve();
        this.server = null;
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Method not allowed');
      return;
    }

    let params: Record<string, string>;
    if (method === 'GET' && req.url) {
      const q = req.url.indexOf('?');
      params = q >= 0 ? this.parseQuery(req.url.slice(q + 1)) : {};
    } else {
      params = await this.parseBody(req);
      if (req.url && req.url.includes('?')) {
        const q = req.url.indexOf('?');
        params = { ...this.parseQuery(req.url.slice(q + 1)), ...params };
      }
    }

    const id = params['id'] ?? params['deviceid'] ?? params['deviceId'];
    if (!id || !id.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Missing id or deviceid');
      return;
    }

    const lat = parseFloat(params['lat'] ?? '');
    const lon = parseFloat(params['lon'] ?? '');
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Invalid lat or lon');
      return;
    }

    let timestamp: Date;
    const ts = params['timestamp']?.trim();
    if (ts) {
      const ms = parseInt(ts, 10);
      if (!Number.isNaN(ms)) {
        timestamp = ms < 1e10 ? new Date(ms * 1000) : new Date(ms);
      } else {
        timestamp = new Date(ts);
      }
      if (Number.isNaN(timestamp.getTime())) timestamp = new Date();
    } else {
      timestamp = new Date();
    }

    const speed = params['speed']?.trim();
    const speedNum = speed ? parseFloat(speed) : undefined;

    const deviceId = `osmand-${id.trim()}`;
    await this.processPosition.execute({
      deviceId,
      latitude: lat,
      longitude: lon,
      timestamp,
      speed: speedNum !== undefined && !Number.isNaN(speedNum) && speedNum >= 0 ? speedNum : undefined,
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('OK');
  }

  private parseQuery(qs: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of qs.split('&')) {
      const eq = part.indexOf('=');
      if (eq >= 0) {
        out[decodeURIComponent(part.slice(0, eq)).trim()] = decodeURIComponent(part.slice(eq + 1)).trim();
      }
    }
    return out;
  }

  private parseBody(req: http.IncomingMessage): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!body) {
          resolve({});
          return;
        }
        const out: Record<string, string> = {};
        if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          for (const part of body.split('&')) {
            const eq = part.indexOf('=');
            if (eq >= 0) {
              out[decodeURIComponent(part.slice(0, eq)).trim()] = decodeURIComponent(part.slice(eq + 1)).trim();
            }
          }
        }
        resolve(out);
      });
      req.on('error', reject);
    });
  }
}
