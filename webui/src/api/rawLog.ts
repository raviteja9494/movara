import { api } from './client';

export interface RawLogEntry {
  at: string;
  port: number;
  raw: string;
  remoteAddress?: string;
}

export interface RawLogResponse {
  entries: RawLogEntry[];
}

export function fetchRawLog(params?: { port?: number; limit?: number }): Promise<RawLogResponse> {
  const search = new URLSearchParams();
  if (params?.port != null) search.set('port', String(params.port));
  if (params?.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<RawLogResponse>(qs ? `/raw-log?${qs}` : '/raw-log');
}
