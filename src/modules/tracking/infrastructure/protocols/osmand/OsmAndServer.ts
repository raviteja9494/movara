import http from 'http';
import type { ProcessIncomingPositionUseCase } from '../../../application/use-cases/ProcessIncomingPositionUseCase';
import type { FastifyLoggerInstance } from 'fastify';
import { rawLogBuffer } from '../../../../../shared/rawLog/RawLogBuffer';
import { protocolDebugLogger } from '../../../../../shared/protocolDebug/ProtocolDebugLogger';
import { deviceStateStore } from '../../device/DeviceStateStore';

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
    const receivedAt = new Date();
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Method not allowed');
      return;
    }

    let params: Record<string, string>;
    let parsedJson: Record<string, unknown> | undefined;
    let rawBody = '';
    if (method === 'GET' && req.url) {
      const q = req.url.indexOf('?');
      params = q >= 0 ? this.parseQuery(req.url.slice(q + 1)) : {};
      rawLogBuffer.push({
        port: this.port,
        raw: `${method} ${req.url}`,
        remoteAddress: req.socket?.remoteAddress,
      });
      protocolDebugLogger.log({
        protocol: 'osmand',
        direction: 'in',
        kind: 'request',
        port: this.port,
        remoteAddress: req.socket?.remoteAddress,
        raw: `${method} ${req.url}`,
      });
    } else {
      const { body, parsed, parsedJson: pj } = await this.readBody(req);
      rawBody = body;
      params = parsed;
      parsedJson = pj;
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
      protocolDebugLogger.log({
        protocol: 'osmand',
        direction: 'in',
        kind: 'request',
        port: this.port,
        remoteAddress: req.socket?.remoteAddress,
        raw: `POST ${req.url ?? '/'} | body: ${bodyPreview || '(empty)'}`,
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

    const { positions, totalLocations, invalidLocations } = this.extractPositions(params, parsedJson);

    if (totalLocations > 0 && positions.length === 0) {
      this.logger.warn?.(
        { deviceId: id.trim(), totalLocations, invalidLocations },
        'OsmAnd batch payload contained no valid positions',
      );
      protocolDebugLogger.log({
        protocol: 'osmand',
        direction: 'meta',
        kind: 'parse',
        port: this.port,
        remoteAddress: req.socket?.remoteAddress,
        deviceId: id.trim(),
        valid: false,
        action: 'batch_invalid',
        details: {
          totalLocations,
          invalidLocations,
        },
      });
      res.statusCode = 400;
      res.end('No valid positions in locations payload');
      return;
    }

    if (invalidLocations > 0) {
      this.logger.warn?.(
        { deviceId: id.trim(), totalLocations, invalidLocations, acceptedLocations: positions.length },
        'OsmAnd batch payload contained invalid positions',
      );
      protocolDebugLogger.log({
        protocol: 'osmand',
        direction: 'meta',
        kind: 'parse',
        port: this.port,
        remoteAddress: req.socket?.remoteAddress,
        deviceId: id.trim(),
        valid: true,
        action: 'batch_partial',
        details: {
          totalLocations,
          invalidLocations,
          acceptedLocations: positions.length,
        },
      });
    }

    const deviceId = `osmand-${id.trim()}`;
    const pingAttributes = this.buildOsmAndAttributesFromParams(params, parsedJson);
    if (positions.length === 0 && !hasValidCoords) {
      deviceStateStore.updateProtocol(deviceId, 'osmand');
      deviceStateStore.updateLastAttributes(deviceId, pingAttributes ?? undefined);
      if (pingAttributes?.tracker_active === false) {
        deviceStateStore.setStatus(deviceId, 'offline', receivedAt);
      } else if (pingAttributes?.tracker_active === true) {
        deviceStateStore.setStatus(deviceId, 'online', receivedAt);
      }
      // Ping/registration without position: accept so client stays connected.
      res.end('OK');
      return;
    }

    deviceStateStore.updateProtocol(deviceId, 'osmand');
    const positionsToPersist =
      positions.length > 0
        ? positions
        : [
            {
              latitude: lat,
              longitude: lon,
              timestamp: this.parseTimestamp(params['timestamp']),
              speed: this.parseSpeed(params['speed']),
              attributes: this.buildOsmAndAttributesFromParams(params, parsedJson),
            },
          ];

    for (const position of positionsToPersist) {
      await this.processPosition.execute({
        deviceId,
        receivedAt,
        latitude: position.latitude,
        longitude: position.longitude,
        timestamp: position.timestamp,
        speed: position.speed,
        attributes: position.attributes ?? undefined,
      });
      protocolDebugLogger.log({
        protocol: 'osmand',
        direction: 'meta',
        kind: 'persist',
        port: this.port,
        remoteAddress: req.socket?.remoteAddress,
        deviceId,
        valid: true,
        action: 'position_saved',
        details: {
          timestamp: position.timestamp.toISOString(),
          latitude: position.latitude,
          longitude: position.longitude,
          speed: position.speed,
          batchSize: positionsToPersist.length,
        },
      });
    }

    res.end('OK');
  }

  /** Build optional attributes from OsmAnd JSON payload for storage (like Traccar). */
  private buildOsmAndAttributes(parsedJson: Record<string, unknown> | undefined): Record<string, unknown> | null {
    if (!parsedJson || typeof parsedJson !== 'object') return null;
    const loc = parsedJson['location'];
    if (!loc || typeof loc !== 'object' || Array.isArray(loc)) return null;
    return this.buildOsmAndAttributesFromLocation(loc as Record<string, unknown>);
  }

  private buildOsmAndAttributesFromLocation(location: Record<string, unknown>): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    if (typeof location.is_moving === 'boolean') out.is_moving = location.is_moving;
    if (typeof location.odometer === 'number') out.odometer = location.odometer;
    if (typeof location.event === 'string') out.event = location.event;
    const coords = location.coords;
    if (coords && typeof coords === 'object' && !Array.isArray(coords)) {
      const c = coords as Record<string, unknown>;
      if (typeof c.accuracy === 'number') out.accuracy = c.accuracy;
      if (typeof c.altitude === 'number') out.altitude = c.altitude;
      if (typeof c.heading === 'number' && c.heading >= 0) out.heading = c.heading;
    }
    const battery = location.battery;
    if (battery && typeof battery === 'object' && !Array.isArray(battery)) {
      const b = battery as Record<string, unknown>;
      if (typeof b.level === 'number') out.battery_level = b.level;
      if (typeof b.is_charging === 'boolean') out.battery_charging = b.is_charging;
    }
    const activity = location.activity;
    if (activity && typeof activity === 'object' && !Array.isArray(activity)) {
      const a = activity as Record<string, unknown>;
      if (typeof a.type === 'string') out.activity_type = a.type;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  private buildOsmAndAttributesFromParams(
    params: Record<string, string>,
    parsedJson: Record<string, unknown> | undefined,
  ): Record<string, unknown> | null {
    const out = { ...(this.buildOsmAndAttributes(parsedJson) ?? {}) };
    const accuracy = this.parseOptionalNumber(params['accuracy']);
    const altitude = this.parseOptionalNumber(params['altitude']);
    const heading = this.parseOptionalNumber(params['bearing'] ?? params['heading']);
    const battery = this.parseOptionalNumber(params['battery'] ?? params['batt'] ?? params['batteryLevel']);
    const trackerActive = this.parseOptionalBoolean(params['trackerActive'] ?? params['tracker_active']);
    if (accuracy != null) out.accuracy = accuracy;
    if (altitude != null) out.altitude = altitude;
    if (heading != null && heading >= 0) out.heading = heading;
    if (battery != null) out.battery_level = battery > 1 ? battery / 100 : battery;
    if (params['source']) out.source = params['source'];
    if (trackerActive != null) out.tracker_active = trackerActive;
    return Object.keys(out).length > 0 ? out : null;
  }

  private extractPositions(
    params: Record<string, string>,
    parsedJson: Record<string, unknown> | undefined,
  ): {
    positions: Array<{
      latitude: number;
      longitude: number;
      timestamp: Date;
      speed?: number;
      attributes?: Record<string, unknown> | null;
    }>;
    totalLocations: number;
    invalidLocations: number;
  } {
    if (!parsedJson || typeof parsedJson !== 'object') {
      return { positions: [], totalLocations: 0, invalidLocations: 0 };
    }
    const rawLocations = parsedJson['locations'];
    if (!Array.isArray(rawLocations)) {
      return { positions: [], totalLocations: 0, invalidLocations: 0 };
    }

    const positions = rawLocations
      .map((location) => this.extractPositionFromLocation(location, params))
      .filter((position): position is NonNullable<typeof position> => position != null);
    return {
      positions,
      totalLocations: rawLocations.length,
      invalidLocations: rawLocations.length - positions.length,
    };
  }

  private extractPositionFromLocation(
    location: unknown,
    params: Record<string, string>,
  ): {
    latitude: number;
    longitude: number;
    timestamp: Date;
    speed?: number;
    attributes?: Record<string, unknown> | null;
  } | null {
    if (!location || typeof location !== 'object' || Array.isArray(location)) {
      return null;
    }

    const loc = location as Record<string, unknown>;
    const coords = loc['coords'];
    if (!coords || typeof coords !== 'object' || Array.isArray(coords)) {
      return null;
    }

    const coordValues = coords as Record<string, unknown>;
    const latitude = typeof coordValues['latitude'] === 'number' ? coordValues['latitude'] : Number.NaN;
    const longitude = typeof coordValues['longitude'] === 'number' ? coordValues['longitude'] : Number.NaN;
    const hasValidCoords =
      !Number.isNaN(latitude) &&
      !Number.isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

    if (!hasValidCoords) {
      return null;
    }

    return {
      latitude,
      longitude,
      timestamp: this.parseTimestamp(loc['timestamp'] ?? params['timestamp']),
      speed: this.parseSpeed(coordValues['speed']),
      attributes: this.buildOsmAndAttributesFromLocation(loc),
    };
  }

  private parseTimestamp(raw: unknown): Date {
    const value = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
    if (!value) {
      return new Date();
    }
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) {
      return asDate;
    }
    const ms = parseInt(value, 10);
    if (!Number.isNaN(ms)) {
      return ms < 1e10 ? new Date(ms * 1000) : new Date(ms);
    }
    return new Date();
  }

  private parseSpeed(raw: unknown): number | undefined {
    const value = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
    if (!value) {
      return undefined;
    }
    const speed = parseFloat(value);
    return !Number.isNaN(speed) && speed >= 0 ? speed : undefined;
  }

  private parseOptionalNumber(raw: unknown): number | null {
    const value = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
    if (!value) return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseOptionalBoolean(raw: unknown): boolean | null {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : raw != null ? String(raw).trim().toLowerCase() : '';
    if (!value) return null;
    if (['1', 'true', 'yes', 'on', 'active'].includes(value)) return true;
    if (['0', 'false', 'no', 'off', 'stopped', 'inactive'].includes(value)) return false;
    return null;
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
