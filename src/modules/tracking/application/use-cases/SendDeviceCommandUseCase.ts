import type { DeviceCommandStore } from '../../infrastructure/device/DeviceCommandStore';
import type { DeviceStateStore } from '../../infrastructure/device/DeviceStateStore';
import type { LiveDeviceConnectionRegistry } from '../../infrastructure/device/LiveDeviceConnectionRegistry';
import type { DeviceRepository } from '../../domain/repositories';
import { EelinkCommandEncoder } from '../../infrastructure/protocols/eelink/EelinkCommandEncoder';
import { Gt06CommandEncoder } from '../../infrastructure/protocols/gt06/Gt06CommandEncoder';
import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';
import { buildCommandContent, getCommandCatalogForProtocol } from '../device-commands/catalog';
import type { DeviceCommandDefinition, DeviceCommandRecord } from '../device-commands/types';
import type { OwnershipPolicy } from '../../../../shared/authorization';

export interface SendDeviceCommandRequest {
  deviceId: string;
  commandKey: string;
  values: Record<string, string | undefined>;
}

export interface AvailableDeviceCommandsResult {
  protocol: TrackingProtocol;
  supportsCommands: boolean;
  commandConnected: boolean;
  commands: DeviceCommandDefinition[];
}

export class SendDeviceCommandUseCase {
  private eelinkEncoder = new EelinkCommandEncoder();
  private gt06Encoder = new Gt06CommandEncoder();

  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly deviceStateStore: DeviceStateStore,
    private readonly deviceCommandStore: DeviceCommandStore,
    private readonly liveDeviceConnectionRegistry: LiveDeviceConnectionRegistry,
    private readonly ownership: OwnershipPolicy,
  ) {}

  async getAvailable(userId: string, deviceId: string): Promise<AvailableDeviceCommandsResult> {
    await this.ownership.assertOwns(userId, 'device', deviceId);
    const device = await this.deviceRepository.findById(userId, deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    const protocol = await this.deviceStateStore.getProtocol(device.imei);
    const commands = getCommandCatalogForProtocol(protocol);
    return {
      protocol,
      supportsCommands: commands.length > 0,
      commandConnected: this.liveDeviceConnectionRegistry.hasLiveConnection(protocol, device.imei),
      commands,
    };
  }

  async listHistory(userId: string, deviceId: string): Promise<DeviceCommandRecord[]> {
    await this.ownership.assertOwns(userId, 'device', deviceId);
    return this.deviceCommandStore.listByDevice(deviceId, 30);
  }

  async execute(userId: string, request: SendDeviceCommandRequest): Promise<DeviceCommandRecord> {
    await this.ownership.assertOwns(userId, 'device', request.deviceId);
    const device = await this.deviceRepository.findById(userId, request.deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    const protocol = await this.deviceStateStore.getProtocol(device.imei);
    if (protocol !== 'eelink' && protocol !== 'gt06') {
      throw new Error(`Downlink commands are not implemented for protocol ${protocol}`);
    }

    const content = buildCommandContent(protocol, request.commandKey, request.values);
    let payload: Buffer;
    let serverFlag: number | null = null;
    if (protocol === 'eelink') {
      const encoded = this.eelinkEncoder.encodeCommand(content);
      payload = encoded.payload;
      serverFlag = encoded.serverFlag;
    } else {
      const encoded = this.gt06Encoder.encodeCommand(content);
      payload = encoded.payload;
    }
    const record = await this.deviceCommandStore.add({
      deviceId: device.id,
      imei: device.imei,
      protocol,
      commandKey: request.commandKey,
      commandLabel: this.resolveLabel(protocol, request.commandKey),
      content,
      transport: protocol === 'eelink' ? 'eelink_0x80' : 'gt06_0x80',
      serverFlag: null,
      status: 'pending',
      sentAt: null,
      respondedAt: null,
      response: null,
      error: null,
    }, payload);

    if (!this.liveDeviceConnectionRegistry.hasLiveConnection(protocol, device.imei)) {
      return record;
    }

    try {
      await this.liveDeviceConnectionRegistry.send(protocol, device.imei, payload);
      return await this.deviceCommandStore.markSent(record.id, serverFlag) ?? record;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await this.deviceCommandStore.markFailed(record.id, message) ?? record;
    }
  }

  async flushPendingForImei(protocol: TrackingProtocol, imei: string): Promise<void> {
    if (!this.liveDeviceConnectionRegistry.hasLiveConnection(protocol, imei)) {
      return;
    }

    for (const entry of await this.deviceCommandStore.listPending(protocol, imei)) {
      try {
        await this.liveDeviceConnectionRegistry.send(protocol, imei, entry.payload);
        const serverFlag = protocol === 'eelink' && entry.payload.length >= 12 ? entry.payload.readUInt32BE(8) : null;
        await this.deviceCommandStore.markSent(entry.record.id, serverFlag);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.deviceCommandStore.markFailed(entry.record.id, message);
      }
    }
  }

  private resolveLabel(protocol: TrackingProtocol, commandKey: string): string {
    return getCommandCatalogForProtocol(protocol).find((command) => command.key === commandKey)?.label ?? commandKey;
  }
}
