import { Prisma, type PrismaClient } from '@prisma/client';
import { Device } from '../../domain/entities';
import { DeviceRepository } from '../../domain/repositories';

export class PrismaDeviceRepository implements DeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByImei(imei: string): Promise<Device | null> {
    const record = await this.prisma.device.findUnique({ where: { imei } });

    if (!record) return null;

    return new Device(record.id, record.userId, record.imei, record.name, record.createdAt);
  }

  async findById(userId: string, id: string): Promise<Device | null> {
    const record = await this.prisma.device.findFirst({ where: { id, userId } });
    if (!record) return null;
    return new Device(record.id, record.userId, record.imei, record.name, record.createdAt);
  }

  async list(userId: string, offset: number, limit: number) {
    const [records, total] = await Promise.all([
      this.prisma.device.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
      this.prisma.device.count({ where: { userId } }),
    ]);
    return { items: records.map((record) => new Device(record.id, record.userId, record.imei, record.name, record.createdAt)), total };
  }

  async create(device: Device): Promise<Device> {
    const existing = await this.prisma.device.findUnique({ where: { imei: device.imei } });
    if (existing) {
      if (existing.userId !== device.userId) throw new Error('Device identifier is already provisioned');
      return new Device(existing.id, existing.userId, existing.imei, existing.name, existing.createdAt);
    }

    let record;
    try {
      record = await this.prisma.device.create({
        data: {
          id: device.id,
          userId: device.userId,
          imei: device.imei,
          name: device.name,
          createdAt: device.createdAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.device.findUnique({ where: { imei: device.imei } });
        if (concurrent) {
          if (concurrent.userId !== device.userId) throw new Error('Device identifier is already provisioned');
          return new Device(concurrent.id, concurrent.userId, concurrent.imei, concurrent.name, concurrent.createdAt);
        }
      }
      throw error;
    }

    return new Device(record.id, record.userId, record.imei, record.name, record.createdAt);
  }

  async updateName(userId: string, id: string, name: string | null): Promise<Device | null> {
    await this.prisma.device.updateMany({ where: { id, userId }, data: { name } });
    const record = await this.prisma.device.findFirst({ where: { id, userId } });
    return record ? new Device(record.id, record.userId, record.imei, record.name, record.createdAt) : null;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.device.deleteMany({ where: { id, userId } });
  }
}
