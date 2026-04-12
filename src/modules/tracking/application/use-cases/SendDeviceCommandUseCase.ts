import { deviceCommandStore } from '../../infrastructure/device/DeviceCommandStore';
import { deviceStateStore } from '../../infrastructure/device/DeviceStateStore';
import { liveDeviceConnectionRegistry } from '../../infrastructure/device/LiveDeviceConnectionRegistry';
import { PrismaDeviceRepository } from '../../infrastructure/persistence/PrismaDeviceRepository';
import { EelinkCommandEncoder } from '../../infrastructure/protocols/eelink/EelinkCommandEncoder';
import { Gt06CommandEncoder } from '../../infrastructure/protocols/gt06/Gt06CommandEncoder';
import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';
import { buildCommandContent, getCommandCatalogForProtocol } from '../device-commands/catalog';
import type { DeviceCommandDefinition, DeviceCommandRecord } from '../device-commands/types';

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
  private deviceRepository = new PrismaDeviceRepository();
  private eelinkEncoder = new EelinkCommandEncoder();
  private gt06Encoder = new Gt06CommandEncoder();

  async getAvailable(deviceId: string): Promise<AvailableDeviceCommandsResult> {
    const device = await this.deviceRepository.findById(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    const protocol = deviceStateStore.getProtocol(device.imei);
    const commands = getCommandCatalogForProtocol(protocol);
    return {
      protocol,
      supportsCommands: commands.length > 0,
      commandConnected: liveDeviceConnectionRegistry.hasLiveConnection(protocol, device.imei),
      commands,
    };
  }

  async listHistory(deviceId: string): Promise<DeviceCommandRecord[]> {
    return deviceCommandStore.listByDevice(deviceId, 30);
  }

  async execute(request: SendDeviceCommandRequest): Promise<DeviceCommandRecord> {
    const device = await this.deviceRepository.findById(request.deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    const protocol = deviceStateStore.getProtocol(device.imei);
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
    const record = deviceCommandStore.add({
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

    if (!liveDeviceConnectionRegistry.hasLiveConnection(protocol, device.imei)) {
      return record;
    }

    try {
      await liveDeviceConnectionRegistry.send(protocol, device.imei, payload);
      return deviceCommandStore.markSent(record.id, serverFlag) ?? record;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return deviceCommandStore.markFailed(record.id, message) ?? record;
    }
  }

  async flushPendingForImei(protocol: TrackingProtocol, imei: string): Promise<void> {
    if (!liveDeviceConnectionRegistry.hasLiveConnection(protocol, imei)) {
      return;
    }

    for (const entry of deviceCommandStore.listPending(protocol, imei)) {
      try {
        await liveDeviceConnectionRegistry.send(protocol, imei, entry.payload);
        const serverFlag = protocol === 'eelink' && entry.payload.length >= 12 ? entry.payload.readUInt32BE(8) : null;
        deviceCommandStore.markSent(entry.record.id, serverFlag);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deviceCommandStore.markFailed(entry.record.id, message);
      }
    }
  }

  private resolveLabel(protocol: TrackingProtocol, commandKey: string): string {
    return getCommandCatalogForProtocol(protocol).find((command) => command.key === commandKey)?.label ?? commandKey;
  }
}
