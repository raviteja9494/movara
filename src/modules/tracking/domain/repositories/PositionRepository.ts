import { Position } from '../entities';

export interface PositionRepository {
  save(position: Position): Promise<Position>;
  findByDeviceId(deviceId: string, limit?: number): Promise<Position[]>;
}
