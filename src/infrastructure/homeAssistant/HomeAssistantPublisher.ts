import type { FastifyBaseLogger } from 'fastify';
import { PrismaDeviceRepository } from '../../modules/tracking/infrastructure/persistence/PrismaDeviceRepository';
import { PrismaPositionRepository } from '../../modules/tracking/infrastructure/persistence/PrismaPositionRepository';
import { deviceCommandStore } from '../../modules/tracking/infrastructure/device/DeviceCommandStore';
import { deviceStateStore } from '../../modules/tracking/infrastructure/device/DeviceStateStore';
import { runtimeSettingsStore } from '../../shared/runtimeSettings/RuntimeSettingsStore';

type PrimitiveState = string | number | boolean;

interface HomeAssistantStateAttributes {
  friendly_name: string;
  icon?: string;
  unit_of_measurement?: string;
  device_class?: string;
  state_class?: string;
  [key: string]: unknown;
}

export class HomeAssistantPublisher {
  private readonly deviceRepository = new PrismaDeviceRepository();
  private readonly positionRepository = new PrismaPositionRepository();

  constructor(private readonly logger: FastifyBaseLogger) {}

  private getConfig(): { enabled: boolean; baseUrl: string | null; token: string | null } {
    const settings = runtimeSettingsStore.get();
    const baseUrl = settings.homeAssistantUrl?.trim()?.replace(/\/$/, '') || null;
    const token = settings.homeAssistantToken?.trim() || null;
    return {
      enabled: Boolean(settings.homeAssistantEnabled && baseUrl && token),
      baseUrl,
      token,
    };
  }

  isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  async syncFromPresenceEvent(event: { imei?: string }, isOnline: boolean): Promise<void> {
    if (!event.imei) return;
    await this.syncByImei(event.imei, { forceStatus: isOnline ? 'online' : 'offline' });
  }

  async syncFromTelemetryEvent(event: { deviceId?: string }): Promise<void> {
    if (!event.deviceId) return;
    const device = await this.deviceRepository.findById(event.deviceId);
    if (!device) return;
    await this.syncByImei(device.imei);
  }

  async syncFromPositionEvent(event: { deviceId?: string; latitude?: number; longitude?: number; speed?: number | null }): Promise<void> {
    if (!event.deviceId) return;
    const device = await this.deviceRepository.findById(event.deviceId);
    if (!device) return;
    await this.syncByImei(device.imei, {
      latestPosition: event.latitude != null && event.longitude != null
        ? { latitude: event.latitude, longitude: event.longitude, speed: event.speed ?? null }
        : undefined,
    });
  }

  async syncByImei(
    imei: string,
    overrides?: {
      forceStatus?: 'online' | 'offline';
      latestPosition?: { latitude: number; longitude: number; speed: number | null };
    },
  ): Promise<void> {
    const { enabled, baseUrl, token } = this.getConfig();
    if (!enabled || !baseUrl || !token) return;
    const device = await this.deviceRepository.findByImei(imei);
    if (!device) return;
    const latestPosition = overrides?.latestPosition ?? (await this.positionRepository.findByDeviceId(device.id, 1))[0] ?? null;
    const lastSeen = deviceStateStore.getLastSeen(imei);
    const protocol = deviceStateStore.getProtocol(imei);
    const lastAttributes = deviceStateStore.getLastAttributes(imei) ?? {};
    const packetSnapshots = deviceStateStore.getPacketAttributes(imei);
    const status = overrides?.forceStatus ?? deviceStateStore.getStatus(imei);

    const slug = this.slugify(imei);
    const baseName = device.name?.trim() || `Tracker ${imei}`;

    await Promise.all([
      this.publishEntity(`binary_sensor.movara_${slug}_online`, status === 'online' ? 'on' : 'off', {
        friendly_name: `${baseName} online`,
        device_class: 'connectivity',
        imei,
        protocol,
        last_seen: lastSeen?.toISOString() ?? null,
      }, baseUrl, token),
      this.publishEntity(`sensor.movara_${slug}_protocol`, protocol, {
        friendly_name: `${baseName} protocol`,
        icon: 'mdi:lan-connect',
        imei,
      }, baseUrl, token),
      this.publishEntity(`sensor.movara_${slug}_last_seen`, lastSeen?.toISOString() ?? 'unavailable', {
        friendly_name: `${baseName} last seen`,
        device_class: 'timestamp',
        imei,
      }, baseUrl, token),
      this.publishEntity(`sensor.movara_${slug}_imei`, imei, {
        friendly_name: `${baseName} IMEI`,
        icon: 'mdi:identifier',
      }, baseUrl, token),
    ]);

    if (latestPosition) {
      await Promise.all([
        this.publishEntity(`sensor.movara_${slug}_latitude`, latestPosition.latitude, {
          friendly_name: `${baseName} latitude`,
          icon: 'mdi:latitude',
        }, baseUrl, token),
        this.publishEntity(`sensor.movara_${slug}_longitude`, latestPosition.longitude, {
          friendly_name: `${baseName} longitude`,
          icon: 'mdi:longitude',
        }, baseUrl, token),
        this.publishEntity(`sensor.movara_${slug}_speed`, latestPosition.speed ?? 0, {
          friendly_name: `${baseName} speed`,
          icon: 'mdi:speedometer',
          unit_of_measurement: 'km/h',
        }, baseUrl, token),
      ]);
    }

    const primitiveAttributes = this.collectPrimitiveAttributes(lastAttributes, packetSnapshots);
    await Promise.all(
      Object.entries(primitiveAttributes).map(([key, value]) =>
        this.publishAttributeEntity(slug, baseName, key, value, baseUrl, token),
      ),
    );

    const latestCommand = deviceCommandStore.listByDevice(device.id, 1)[0] ?? null;
    if (latestCommand) {
      await Promise.all([
        this.publishEntity(`sensor.movara_${slug}_command_status`, latestCommand.status, {
          friendly_name: `${baseName} command status`,
          icon: 'mdi:console-line',
          command_label: latestCommand.commandLabel,
          command_content: latestCommand.content,
        }, baseUrl, token),
        this.publishEntity(`sensor.movara_${slug}_command_response`, latestCommand.response ?? latestCommand.error ?? '', {
          friendly_name: `${baseName} command response`,
          icon: 'mdi:message-text-outline',
          command_label: latestCommand.commandLabel,
          command_content: latestCommand.content,
          status: latestCommand.status,
        }, baseUrl, token),
      ]);
    }
  }

  private collectPrimitiveAttributes(
    lastAttributes: Record<string, unknown>,
    packetSnapshots: Array<{ packetId: string; updatedAt: Date; attributes: Record<string, unknown> }>,
  ): Record<string, PrimitiveState> {
    const output: Record<string, PrimitiveState> = {};
    for (const [key, value] of Object.entries(lastAttributes)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        output[key] = value;
      }
    }
    for (const snapshot of packetSnapshots) {
      const packetPrefix = snapshot.packetId.replace(/^0x/i, 'packet_');
      for (const [key, value] of Object.entries(snapshot.attributes)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          output[`${packetPrefix}_${key}`] = value;
        }
      }
    }
    return output;
  }

  private async publishAttributeEntity(
    slug: string,
    baseName: string,
    key: string,
    value: PrimitiveState,
    baseUrl: string,
    token: string,
  ): Promise<void> {
    const entityId = `${typeof value === 'boolean' ? 'binary_sensor' : 'sensor'}.movara_${slug}_${this.slugify(key)}`;
    const friendlyName = `${baseName} ${key.replace(/_/g, ' ')}`;
    if (typeof value === 'boolean') {
      await this.publishEntity(entityId, value ? 'on' : 'off', {
        friendly_name: friendlyName,
      }, baseUrl, token);
      return;
    }
    const attributes: HomeAssistantStateAttributes = { friendly_name: friendlyName };
    if (/battery/i.test(key)) attributes.icon = 'mdi:battery';
    if (/signal/i.test(key) || /gsm/i.test(key)) attributes.icon = 'mdi:signal';
    if (/ignition/i.test(key)) attributes.icon = 'mdi:key-variant';
    if (/charging/i.test(key)) attributes.icon = 'mdi:battery-charging';
    if (/_percent$/.test(key) || /percent/i.test(key)) attributes.unit_of_measurement = '%';
    if (/voltage/i.test(key)) attributes.unit_of_measurement = 'V';
    if (/coolant/i.test(key)) attributes.unit_of_measurement = 'degC';
    if (/rpm/i.test(key)) attributes.unit_of_measurement = 'rpm';
    if (/fuel/i.test(key) && /level/i.test(key)) attributes.unit_of_measurement = '%';
    await this.publishEntity(entityId, value, attributes, baseUrl, token);
  }

  private async publishEntity(
    entityId: string,
    state: PrimitiveState,
    attributes: HomeAssistantStateAttributes,
    baseUrl: string,
    token: string,
  ): Promise<void> {
    try {
      const response = await fetch(`${baseUrl}/api/states/${entityId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: String(state),
          attributes,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn({ entityId, statusCode: response.status, body }, 'Home Assistant state push failed');
      }
    } catch (error) {
      this.logger.warn({ err: error, entityId }, 'Home Assistant state push error');
    }
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'device';
  }
}
