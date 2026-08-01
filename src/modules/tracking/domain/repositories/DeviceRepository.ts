import { Device } from '../entities';

export interface DeviceRepository {
  findByImei(imei: string): Promise<Device | null>;
  findById(userId: string, id: string): Promise<Device | null>;
  list(userId: string, offset: number, limit: number): Promise<{ items: Device[]; total: number }>;
  create(device: Device): Promise<Device>;
  updateName(userId: string, id: string, name: string | null): Promise<Device | null>;
  delete(userId: string, id: string): Promise<void>;
}
