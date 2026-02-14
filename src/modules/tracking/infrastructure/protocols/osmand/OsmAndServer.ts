import http from 'http';
import type { ProcessIncomingPositionUseCase } from '../../../application/use-cases/ProcessIncomingPositionUseCase';
import type { FastifyLoggerInstance } from 'fastify';
import { rawLogBuffer } from '../../../../../shared/rawLog/RawLogBuffer';

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
    let rawBody = '';
    if (method === 'GET' && req.url) {
      const q = req.url.indexOf('?');
      params = q >= 0 ? this.parseQuery(req.url.slice(q + 1)) : {};
      rawLogBuffer.push({
        port: this.port,
        raw: `${method} ${req.url}`,
        remoteAddress: req.socket?.remoteAddress,
      });
    } else {
      const { body, parsed, parsedJson } = await this.readBody(req);
      rawBody = body;
      params = parsed;
      if (req.url && req.url.includes('?')) {
        const q = req.url.indexOf('?');
        params = { ...this.parseQuery(req.url.slice(q + 1)), ...params };
      }
      const bodyPreview = rawBody.slice(0, 500).replace(/\r?\n/g, ' ');
      rawLogBuffer.push({
        port: this.port,
        raw: `POST ${req.url ?? '/'} | body: ${bodyPreview || '(empty)'}`,
        remoteAddress: req.socket?.remoteAddress,
      });
    }

    const id = params['id'] ?? params['deviceid'] ?? params['deviceId'] ?? params['device_id'];
    if (!id || !id.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Missing id or deviceid');
      return;
    }

    const lat = parseFloat(params['lat'] ?? params['latitude'] ?? '');
    const lon = parseFloat(params['lon'] ?? params['longitude'] ?? '');
    const hasValidCoords =
      !Number.isNaN(lat) && !Number.isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');

    if (!hasValidCoords) {
      // Ping/registration without position: accept so client stays connected
      res.end('OK');
      return;
    }

    let timestamp: Date;
    const ts = params['timestamp']?.trim();
    if (ts) {
      // ISO strings (e.g. "2026-02-14T16:25:52.247Z") must be parsed as date, not as number
      const asDate = new Date(ts);
      if (!Number.isNaN(asDate.getTime())) {
        timestamp = asDate;
      } else {
        const ms = parseInt(ts, 10);
        if (!Number.isNaN(ms)) {
          timestamp = ms < 1e10 ? new Date(ms * 1000) : new Date(ms);
        } else {
          timestamp = new Date();
        }
      }
    } else {
      timestamp = new Date();
    }

    const speed = params['speed']?.trim();
    const speedNum = speed ? parseFloat(speed) : undefined;

    const deviceId = `osmand-${id.trim()}`;
    const attributes = this.buildOsmAndAttributes(parsedJson);
    await this.processPosition.execute({
      deviceId,
      latitude: lat,
      longitude: lon,
      timestamp,
      speed: speedNum !== undefined && !Number.isNaN(speedNum) && speedNum >= 0 ? speedNum : undefined,
      attributes: attributes ?? undefined,
    });

    res.end('OK');
  }

  /** Build optional attributes from OsmAnd JSON payload for storage (like Traccar). */
  private buildOsmAndAttributes(parsedJson: Record<string, unknown> | undefined): Record<string, unknown> | null {
    if (!parsedJson || typeof parsedJson !== 'object') return null;
    const out: Record<string, unknown> = {};
    const loc = parsedJson['location'];
    if (loc && typeof loc === 'object' && !Array.isArray(loc)) {
      const l = loc as Record<string, unknown>;
      if (typeof l.is_moving === 'boolean') out.is_moving = l.is_moving;
      if (typeof l.odometer === 'number') out.odometer = l.odometer;
      if (typeof l.event === 'string') out.event = l.event;
      const coords = l.coords;
      if (coords && typeof coords === 'object' && !Array.isArray(coords)) {
        const c = coords as Record<string, unknown>;
        if (typeof c.accuracy === 'number') out.accuracy = c.accuracy;
        if (typeof c.altitude === 'number') out.altitude = c.altitude;
        if (typeof c.heading === 'number' && c.heading >= 0) out.heading = c.heading;
      }
      const battery = l.battery;
      if (battery && typeof battery === 'object' && !Array.isArray(battery)) {
        const b = battery as Record<string, unknown>;
        if (typeof b.level === 'number') out.battery_level = b.level;
        if (typeof b.is_charging === 'boolean') out.battery_charging = b.is_charging;
      }
      const activity = l.activity;
      if (activity && typeof activity === 'object' && !Array.isArray(activity)) {
        const a = activity as Record<string, unknown>;
        if (typeof a.type === 'string') out.activity_type = a.type;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
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

  /**
   * Read raw body and parse into flat string params (form-urlencoded or JSON).
   * When JSON, also returns the parsed object for building attributes.
   */
  private readBody(req: http.IncomingMessage): Promise<{
    body: string;
    parsed: Record<string, string>;
    parsedJson?: Record<string, unknown>;
  }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const ct = (req.headers['content-type'] ?? '').toString().toLowerCase();
        const looksLikeJson = body.trim().startsWith('{');
        let parsedJson: Record<string, unknown> | undefined;
        if ((ct.includes('application/json') || looksLikeJson) && body.trim()) {
          try {
            parsedJson = JSON.parse(body) as Record<string, unknown>;
          } catch {
            // ignore
          }
        }
        const parsed = this.parseBodyString(body, req.headers['content-type'], parsedJson);
        resolve({ body, parsed, parsedJson });
      });
      req.on('error', reject);
    });
  }

  private parseBodyString(body: string, contentType?: string, parsedJson?: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!body?.trim()) return out;
    const ct = (contentType ?? '').toString().toLowerCase();
    const obj = parsedJson ?? (body.trim().startsWith('{') ? (() => { try { return JSON.parse(body) as Record<string, unknown>; } catch { return null; } })() : null);
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        if (v != null && typeof v !== 'object') out[k] = String(v).trim();
      }
      this.normalizeJsonLocation(obj, out);
      return out;
    }
    if (ct.includes('application/x-www-form-urlencoded') || body.includes('=')) {
      for (const part of body.split('&')) {
        const eq = part.indexOf('=');
        if (eq >= 0) {
          out[decodeURIComponent(part.slice(0, eq)).trim()] = decodeURIComponent(part.slice(eq + 1)).trim();
        }
      }
    }
    return out;
  }

  /**
   * Extract flat id, lat, lon, timestamp, speed from nested JSON used by some clients
   * (e.g. {"device_id":"676913","location":{"timestamp":"...","coords":{"latitude":...,"longitude":...,"speed":...}}}).
   */
  private normalizeJsonLocation(obj: Record<string, unknown>, out: Record<string, string>): void {
    const deviceId = obj['device_id'];
    if (deviceId != null && typeof deviceId === 'string' && !out['id']) {
      out['id'] = deviceId.trim();
    }
    const location = obj['location'];
    if (!location || typeof location !== 'object' || Array.isArray(location)) return;
    const loc = location as Record<string, unknown>;
    const coords = loc['coords'];
    if (coords && typeof coords === 'object' && !Array.isArray(coords)) {
      const c = coords as Record<string, unknown>;
      if (c['latitude'] != null && !out['lat']) out['lat'] = String(c['latitude']);
      if (c['longitude'] != null && !out['lon']) out['lon'] = String(c['longitude']);
      if (c['speed'] != null && c['speed'] !== -1 && !out['speed']) out['speed'] = String(c['speed']);
    }
    const ts = loc['timestamp'];
    if (ts != null && !out['timestamp']) out['timestamp'] = String(ts);
  }
}
