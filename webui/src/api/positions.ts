import { api } from './client';

export interface Position {
  id: string;
  deviceId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  createdAt: string;
}

export interface LatestPositionsResponse {
  positions: Position[];
}

export interface PositionStatsResponse {
  from: string;
  to: string;
  odometerKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  pointCount: number;
  positions: Position[];
}

export function fetchLatestPositions(
  deviceId: string,
  opts?: number | { limit?: number; from?: string; to?: string }
): Promise<LatestPositionsResponse> {
  const params = new URLSearchParams({ deviceId });
  if (opts != null) {
    if (typeof opts === 'number') {
      params.set('limit', String(opts));
    } else {
      if (opts.limit != null) params.set('limit', String(opts.limit));
      if (opts.from) params.set('from', opts.from);
      if (opts.to) params.set('to', opts.to);
    }
  }
  return api.get<LatestPositionsResponse>(`/positions/latest?${params.toString()}`);
}

export function fetchPositionStats(
  deviceId: string,
  from: string,
  to: string
): Promise<PositionStatsResponse> {
  const params = new URLSearchParams({ deviceId, from, to });
  return api.get<PositionStatsResponse>(`/positions/stats?${params.toString()}`);
}
