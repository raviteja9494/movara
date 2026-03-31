import { api } from './client';
import type { Device } from './devices';

export interface DeviceCommandFieldOption {
  value: string;
  label: string;
}

export interface DeviceCommandFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: DeviceCommandFieldOption[];
}

export interface DeviceCommandDefinition {
  key: string;
  label: string;
  description: string;
  category: 'setup' | 'control' | 'query' | 'obd' | 'custom';
  protocols: Array<'gt06' | 'eelink' | 'osmand' | 'unknown'>;
  fields: DeviceCommandFieldDefinition[];
}

export interface DeviceCommandRecord {
  id: string;
  deviceId: string;
  imei: string;
  protocol: 'gt06' | 'eelink' | 'osmand' | 'unknown';
  commandKey: string;
  commandLabel: string;
  content: string;
  transport: 'eelink_0x80';
  serverFlag?: number | null;
  status: 'pending' | 'sent' | 'responded' | 'failed';
  createdAt: string;
  sentAt: string | null;
  respondedAt?: string | null;
  response?: string | null;
  error: string | null;
}

export interface AvailableDeviceCommandsResponse {
  device: Device;
  protocol: 'gt06' | 'eelink' | 'osmand' | 'unknown';
  supportsCommands: boolean;
  commandConnected: boolean;
  commands: DeviceCommandDefinition[];
}

export interface DeviceCommandsHistoryResponse {
  commands: DeviceCommandRecord[];
}

export interface SendDeviceCommandResponse {
  command: DeviceCommandRecord;
}

export function fetchAvailableDeviceCommands(deviceId: string): Promise<AvailableDeviceCommandsResponse> {
  return api.get<AvailableDeviceCommandsResponse>(`/devices/${deviceId}/commands/available`);
}

export function fetchDeviceCommandHistory(deviceId: string): Promise<DeviceCommandsHistoryResponse> {
  return api.get<DeviceCommandsHistoryResponse>(`/devices/${deviceId}/commands`);
}

export function sendDeviceCommand(deviceId: string, commandKey: string, values: Record<string, string>): Promise<SendDeviceCommandResponse> {
  return api.post<SendDeviceCommandResponse>(`/devices/${deviceId}/commands`, { commandKey, values });
}
