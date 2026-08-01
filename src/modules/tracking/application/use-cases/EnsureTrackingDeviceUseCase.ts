import { Device } from '../../domain/entities';
import { DeviceRepository } from '../../domain/repositories';

export class EnsureTrackingDeviceUseCase {
  constructor(private deviceRepository: DeviceRepository) {}

  async execute(imei: string): Promise<Device> {
    if (!imei) {
      throw new Error('imei is required');
    }

    const existing = await this.deviceRepository.findByImei(imei);
    if (!existing) throw new Error('Device is not provisioned');
    return existing;
  }

  async requireOwned(userId: string, imei: string): Promise<Device> {
    const device = await this.execute(imei);
    if (device.userId !== userId) throw new Error('Device is not provisioned');
    return device;
  }
}
