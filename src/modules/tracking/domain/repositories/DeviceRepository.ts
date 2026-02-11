import { Device } from '../entities';

export interface DeviceRepository {
  findByImei(imei: string): Promise<Device | null>;
  create(device: Device): Promise<Device>;
}
