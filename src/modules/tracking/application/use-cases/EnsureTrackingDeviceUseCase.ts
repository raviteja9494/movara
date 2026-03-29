import { Device } from '../../domain/entities';
import { DeviceRepository } from '../../domain/repositories';

export class EnsureTrackingDeviceUseCase {
  constructor(private deviceRepository: DeviceRepository) {}

  async execute(imei: string): Promise<Device> {
    if (!imei) {
      throw new Error('imei is required');
    }

    const existing = await this.deviceRepository.findByImei(imei);
    if (existing) {
      return existing;
    }

    const device = Device.create(imei);
    return this.deviceRepository.create(device);
  }
}
