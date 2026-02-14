import { Device } from '../entities';

export interface DeviceRepository {
  findByImei(imei: string): Promise<Device | null>;
  findById(id: string): Promise<Device | null>;
  create(device: Device): Promise<Device>;
  updateName(id: string, name: string | null): Promise<Device | null>;
  delete(id: string): Promise<void>;
}
