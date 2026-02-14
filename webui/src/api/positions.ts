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

export function fetchLatestPositions(
  deviceId: string,
  limit?: number
): Promise<LatestPositionsResponse> {
  const params = new URLSearchParams({ deviceId });
  if (limit != null) params.set('limit', String(limit));
  return api.get<LatestPositionsResponse>(`/positions/latest?${params.toString()}`);
}
