import { getPrismaClient } from '../../../../infrastructure/db';
import { Device } from '../../domain/entities';
import { DeviceRepository } from '../../domain/repositories';

export class PrismaDeviceRepository implements DeviceRepository {
  async findByImei(imei: string): Promise<Device | null> {
    const prisma = getPrismaClient();
    const record = await prisma.device.findUnique({ where: { imei } });

    if (!record) return null;

    return new Device(record.id, record.imei, record.name, record.createdAt);
  }

  async findById(id: string): Promise<Device | null> {
    const prisma = getPrismaClient();
    const record = await prisma.device.findUnique({ where: { id } });
    if (!record) return null;
    return new Device(record.id, record.imei, record.name, record.createdAt);
  }

  async create(device: Device): Promise<Device> {
    const prisma = getPrismaClient();
    const record = await prisma.device.create({
      data: {
        id: device.id,
        imei: device.imei,
        name: device.name,
        createdAt: device.createdAt,
      },
    });

    return new Device(record.id, record.imei, record.name, record.createdAt);
  }

  async updateName(id: string, name: string | null): Promise<Device | null> {
    const prisma = getPrismaClient();
    const record = await prisma.device.update({
      where: { id },
      data: { name },
    });
    return new Device(record.id, record.imei, record.name, record.createdAt);
  }
}
