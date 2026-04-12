import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';

export type DeviceCommandFieldType = 'text' | 'number' | 'select' | 'textarea';

export interface DeviceCommandFieldOption {
  value: string;
  label: string;
}

export interface DeviceCommandFieldDefinition {
  key: string;
  label: string;
  type: DeviceCommandFieldType;
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
  protocols: TrackingProtocol[];
  fields: DeviceCommandFieldDefinition[];
}

export interface DeviceCommandRecord {
  id: string;
  deviceId: string;
  imei: string;
  protocol: TrackingProtocol;
  commandKey: string;
  commandLabel: string;
  content: string;
  transport: 'eelink_0x80' | 'gt06_0x80';
  serverFlag?: number | null;
  status: 'pending' | 'sent' | 'responded' | 'failed';
  createdAt: Date;
  sentAt: Date | null;
  respondedAt?: Date | null;
  response?: string | null;
  error: string | null;
}
