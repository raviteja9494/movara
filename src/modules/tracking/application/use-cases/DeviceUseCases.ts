import { NotFoundError } from '../../../../shared/errors';
import type { OwnershipPolicy } from '../../../../shared/authorization';
import { Device } from '../../domain/entities';
import type { DeviceRepository } from '../../domain/repositories';
import { hashOsmAndDeviceSecret } from '../../infrastructure/security/OsmAndDeviceSecret';

export class DeviceUseCases {
  constructor(private readonly devices: DeviceRepository, private readonly ownership: OwnershipPolicy) {}

  async list(userId: string, page: number, limit: number) {
    this.ownership.requireActor(userId);
    return this.devices.list(userId, (page - 1) * limit, limit);
  }

  async provision(userId: string, imei: string, name?: string | null, osmandSecret?: string | null) {
    this.ownership.requireActor(userId);
    const existing = await this.devices.findByImei(imei);
    if (existing) {
      if (existing.userId !== userId) throw new Error('Device identifier is already provisioned');
      return existing;
    }
    return this.devices.create(Device.create(userId, imei, name ?? undefined, osmandSecret ? hashOsmAndDeviceSecret(osmandSecret) : null));
  }

  async get(userId: string, id: string) {
    await this.ownership.assertOwns(userId, 'device', id);
    const device = await this.devices.findById(userId, id);
    if (!device) throw new NotFoundError('Device', id);
    return device;
  }

  async update(userId: string, id: string, input: { name?: string | null; osmandSecret?: string | null }) {
    await this.ownership.assertOwns(userId, 'device', id);
    const updated = await this.devices.update(userId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.osmandSecret !== undefined ? { osmandSecretHash: input.osmandSecret ? hashOsmAndDeviceSecret(input.osmandSecret) : null } : {}),
    });
    if (!updated) throw new NotFoundError('Device', id);
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.ownership.assertOwns(userId, 'device', id);
    await this.devices.delete(userId, id);
  }
}
