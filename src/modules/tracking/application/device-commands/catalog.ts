import type { DeviceCommandDefinition } from './types';
import type { TrackingProtocol } from '../../domain/value-objects/TrackingProtocol';

type CommandValues = Record<string, string | undefined>;

interface InternalDeviceCommandDefinition extends DeviceCommandDefinition {
  buildCommand(values: CommandValues): string;
}

function required(values: CommandValues, key: string, label: string): string {
  const value = values[key]?.trim();
  if (!value) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function optional(values: CommandValues, key: string): string {
  return values[key]?.trim() ?? '';
}

function numberString(
  values: CommandValues,
  key: string,
  label: string,
  options: { integer?: boolean; min?: number; max?: number } = {},
): string {
  const raw = required(values, key, label);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid number`);
  if (options.integer && !Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  if (options.min != null && parsed < options.min) throw new Error(`${label} must be at least ${options.min}`);
  if (options.max != null && parsed > options.max) throw new Error(`${label} must be at most ${options.max}`);
  return options.integer ? String(Math.trunc(parsed)) : String(parsed);
}

function withHash(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Command content cannot be empty');
  return trimmed.endsWith('#') ? trimmed : `${trimmed}#`;
}

const EELINK_COMMANDS: InternalDeviceCommandDefinition[] = [
  {
    key: 'eelink_custom',
    label: 'Custom command',
    description: 'Send any raw Eelink command text through the verified 0x80 downlink packet.',
    category: 'custom',
    protocols: ['eelink'],
    fields: [{ key: 'content', label: 'Command text', type: 'textarea', required: true, placeholder: 'STATUS#' }],
    buildCommand: (values) => withHash(required(values, 'content', 'Command text')),
  },
  {
    key: 'eelink_apn_set',
    label: 'Set APN',
    description: 'Configure APN and optional APN credentials.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [
      { key: 'apn', label: 'APN', type: 'text', required: true, placeholder: 'CMNET' },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'Optional' },
      { key: 'password', label: 'Password', type: 'text', placeholder: 'Optional' },
    ],
    buildCommand: (values) => {
      const parts = ['APN', required(values, 'apn', 'APN')];
      const username = optional(values, 'username');
      const password = optional(values, 'password');
      if (username || password) parts.push(username, password);
      return withHash(parts.join(','));
    },
  },
  { key: 'eelink_apn_get', label: 'Query APN', description: 'Read the current APN settings.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'APN?' },
  {
    key: 'eelink_server_set',
    label: 'Set server',
    description: 'Configure server slot, hostname/IP, and port.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [
      { key: 'slot', label: 'Server slot', type: 'select', required: true, options: [{ value: '0', label: 'Primary (0)' }, { value: '1', label: 'Secondary (1)' }] },
      { key: 'host', label: 'Host or IP', type: 'text', required: true, placeholder: 'gps.example.com' },
      { key: 'port', label: 'Port', type: 'number', required: true, placeholder: '5064' },
    ],
    buildCommand: (values) => withHash(`SERVER,${required(values, 'slot', 'Server slot')},${required(values, 'host', 'Host or IP')},${numberString(values, 'port', 'Port', { integer: true, min: 1, max: 65535 })}`),
  },
  { key: 'eelink_server_get', label: 'Query server', description: 'Read the configured server endpoint.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'SERVER?' },
  {
    key: 'eelink_timer_set',
    label: 'Set GPS upload interval',
    description: 'Set the GPS packet upload interval and optional packet batching count.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [
      { key: 'intervalSeconds', label: 'Interval seconds', type: 'number', required: true, placeholder: '10', helpText: '0 disables uploads; normal range 10-18000 seconds.' },
      { key: 'packetCount', label: 'Packet count', type: 'number', placeholder: '1', helpText: 'Optional batch size, 1-20.' },
    ],
    buildCommand: (values) => {
      const interval = numberString(values, 'intervalSeconds', 'Interval seconds', { integer: true, min: 0, max: 18000 });
      const packetCount = optional(values, 'packetCount');
      return withHash(packetCount ? `TIMER,${interval},${numberString(values, 'packetCount', 'Packet count', { integer: true, min: 1, max: 20 })}` : `TIMER,${interval}`);
    },
  },
  { key: 'eelink_timer_get', label: 'Query GPS upload interval', description: 'Read the current GPS upload interval.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'TIMER?' },
  {
    key: 'eelink_gmt_set',
    label: 'Set timezone',
    description: 'Configure device timezone orientation and offset.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [
      { key: 'orientation', label: 'Orientation', type: 'select', required: true, options: [{ value: 'E', label: 'East' }, { value: 'W', label: 'West' }] },
      { key: 'hours', label: 'Whole hours', type: 'number', required: true, placeholder: '5' },
      { key: 'minutes', label: 'Minutes', type: 'select', options: [{ value: '', label: '00' }, { value: '15', label: '15' }, { value: '30', label: '30' }, { value: '45', label: '45' }] },
    ],
    buildCommand: (values) => {
      const orientation = required(values, 'orientation', 'Orientation');
      const hours = numberString(values, 'hours', 'Whole hours', { integer: true, min: 0, max: 12 });
      const minutes = optional(values, 'minutes');
      return withHash(minutes ? `GMT,${orientation}${hours},${minutes}` : `GMT,${orientation}${hours}`);
    },
  },
  { key: 'eelink_gmt_get', label: 'Query timezone', description: 'Read the current timezone setting.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'GMT?' },
  {
    key: 'eelink_lang_set',
    label: 'Set language',
    description: 'Switch the tracker language setting.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [{ key: 'language', label: 'Language', type: 'select', required: true, options: [{ value: '0', label: 'English' }, { value: '1', label: 'Chinese' }] }],
    buildCommand: (values) => withHash(`LANG,${required(values, 'language', 'Language')}`),
  },
  { key: 'eelink_lang_get', label: 'Query language', description: 'Read the current language setting.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'LANG?' },
  {
    key: 'eelink_center_set',
    label: 'Set center number',
    description: 'Set the center phone number used for relay control and alerts.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [{ key: 'phone', label: 'Phone number', type: 'text', required: true, placeholder: '13800138000' }],
    buildCommand: (values) => withHash(`CENTER,A,${required(values, 'phone', 'Phone number')}`),
  },
  { key: 'eelink_center_clear', label: 'Delete center number', description: 'Remove the configured center phone number.', category: 'setup', protocols: ['eelink'], fields: [], buildCommand: () => 'CENTER,D#' },
  { key: 'eelink_center_get', label: 'Query center number', description: 'Read the configured center number.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'CENTER?' },
  {
    key: 'eelink_sos_add',
    label: 'Set SOS numbers',
    description: 'Configure one or more SOS numbers in slots 1-3.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [
      { key: 'slot1', label: 'Slot 1', type: 'text', placeholder: '13800138000' },
      { key: 'slot2', label: 'Slot 2', type: 'text', placeholder: '13800138001' },
      { key: 'slot3', label: 'Slot 3', type: 'text', placeholder: '13800138002' },
    ],
    buildCommand: (values) => {
      const slot1 = optional(values, 'slot1');
      const slot2 = optional(values, 'slot2');
      const slot3 = optional(values, 'slot3');
      if (!slot1 && !slot2 && !slot3) throw new Error('At least one SOS number is required');
      return withHash(`SOS,A,${slot1},${slot2},${slot3}`);
    },
  },
  {
    key: 'eelink_sos_delete',
    label: 'Delete SOS numbers',
    description: 'Delete SOS slots by slot number(s) or specific phone numbers.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [{ key: 'targets', label: 'Targets', type: 'text', required: true, placeholder: '1,3 or 13800138000' }],
    buildCommand: (values) => withHash(`SOS,D,${required(values, 'targets', 'Targets')}`),
  },
  { key: 'eelink_sos_get', label: 'Query SOS numbers', description: 'Read the configured SOS numbers.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'SOS?' },
  {
    key: 'eelink_eurl_set',
    label: 'Set map URL',
    description: 'Set the map URL template used for location replies.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [{ key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'http://maps.google.com/maps?q=' }],
    buildCommand: (values) => withHash(`EURL,${required(values, 'url', 'URL')}`),
  },
  {
    key: 'eelink_delay_set',
    label: 'Set monitor delay',
    description: 'Set the monitoring delay time in seconds.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [{ key: 'seconds', label: 'Delay seconds', type: 'number', required: true, placeholder: '5' }],
    buildCommand: (values) => withHash(`DELAY,${numberString(values, 'seconds', 'Delay seconds', { integer: true, min: 5, max: 60 })}`),
  },
  { key: 'eelink_delay_get', label: 'Query monitor delay', description: 'Read the current monitor delay.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'DELAY?' },
  {
    key: 'eelink_hbt_set',
    label: 'Set heartbeat interval',
    description: 'Set the heartbeat interval in minutes.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [{ key: 'minutes', label: 'Heartbeat minutes', type: 'number', required: true, placeholder: '3' }],
    buildCommand: (values) => withHash(`HBT,${numberString(values, 'minutes', 'Heartbeat minutes', { integer: true, min: 1, max: 60 })}`),
  },
  { key: 'eelink_hbt_get', label: 'Query heartbeat interval', description: 'Read the current heartbeat interval.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'HBT?' },
  {
    key: 'eelink_motion_set',
    label: 'Set motion alarm',
    description: 'Configure motion alarm sensitivity and timeout.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [
      { key: 'sensitivity', label: 'Sensitivity', type: 'number', required: true, placeholder: '2' },
      { key: 'timeout', label: 'Timeout', type: 'number', required: true, placeholder: '5' },
    ],
    buildCommand: (values) => withHash(`MOTION,${numberString(values, 'sensitivity', 'Sensitivity', { integer: true, min: 0, max: 9 })},${numberString(values, 'timeout', 'Timeout', { integer: true, min: 1, max: 65535 })}`),
  },
  { key: 'eelink_motion_get', label: 'Query motion alarm', description: 'Read the current motion alarm settings.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'MOTION?' },
  {
    key: 'eelink_speed_set',
    label: 'Set speed alarm',
    description: 'Configure minimum and maximum speed alarms in km/h.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [
      { key: 'min', label: 'Minimum speed', type: 'number', required: true, placeholder: '0' },
      { key: 'max', label: 'Maximum speed', type: 'number', required: true, placeholder: '80' },
    ],
    buildCommand: (values) => withHash(`SPEED,${numberString(values, 'min', 'Minimum speed', { integer: true, min: 0, max: 999 })},${numberString(values, 'max', 'Maximum speed', { integer: true, min: 0, max: 999 })}`),
  },
  { key: 'eelink_speed_get', label: 'Query speed alarm', description: 'Read the current speed alarm limits.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'SPEED?' },
  {
    key: 'eelink_fence_set',
    label: 'Set geofence',
    description: 'Set a circular or rectangular fence using the tracker command format.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [
      { key: 'index', label: 'Fence number', type: 'number', required: true, placeholder: '1' },
      { key: 'marking', label: 'Fence marking', type: 'select', required: true, options: [{ value: 'OR', label: 'Round out-fence' }, { value: 'IR', label: 'Round in-fence' }, { value: 'CR', label: 'Round cross-fence' }, { value: 'OS', label: 'Rect out-fence' }, { value: 'IS', label: 'Rect in-fence' }, { value: 'CS', label: 'Rect cross-fence' }] },
      { key: 'param1', label: 'Param 1', type: 'text', placeholder: 'Longitude or blank' },
      { key: 'param2', label: 'Param 2', type: 'text', placeholder: 'Latitude or blank' },
      { key: 'param3', label: 'Param 3', type: 'text', required: true, placeholder: 'Radius or end longitude' },
      { key: 'param4', label: 'Param 4', type: 'text', placeholder: 'End latitude for rectangle' },
    ],
    buildCommand: (values) => {
      const tail = optional(values, 'param4');
      return withHash(`FENCE,${numberString(values, 'index', 'Fence number', { integer: true, min: 1, max: 99 })},${required(values, 'marking', 'Fence marking')},${optional(values, 'param1')},${optional(values, 'param2')},${required(values, 'param3', 'Param 3')}${tail ? `,${tail}` : ''}`);
    },
  },
  { key: 'eelink_fence_delete_all', label: 'Delete all geofences', description: 'Remove all configured geofences.', category: 'setup', protocols: ['eelink'], fields: [], buildCommand: () => 'FENCE,0#' },
  {
    key: 'eelink_fence_delete_one',
    label: 'Delete one geofence',
    description: 'Delete a single geofence by fence number.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [{ key: 'index', label: 'Fence number', type: 'number', required: true, placeholder: '5' }],
    buildCommand: (values) => withHash(`FENCE,${numberString(values, 'index', 'Fence number', { integer: true, min: 1, max: 99 })}`),
  },
  {
    key: 'eelink_fence_get',
    label: 'Query geofence',
    description: 'Read a single geofence definition.',
    category: 'query',
    protocols: ['eelink'],
    fields: [{ key: 'index', label: 'Fence number', type: 'number', required: true, placeholder: '1' }],
    buildCommand: (values) => withHash(`FENCE,${numberString(values, 'index', 'Fence number', { integer: true, min: 1, max: 99 })}?`),
  },
  {
    key: 'eelink_shift_set',
    label: 'Set shift alarm',
    description: 'Enable the parked shift alarm with a movement threshold in meters.',
    category: 'setup',
    protocols: ['eelink'],
    fields: [{ key: 'meters', label: 'Shift meters', type: 'number', required: true, placeholder: '100' }],
    buildCommand: (values) => withHash(`SHIFT,${numberString(values, 'meters', 'Shift meters', { integer: true, min: 0, max: 999999 })}`),
  },
  { key: 'eelink_shift_get', label: 'Query shift alarm', description: 'Read the current shift alarm threshold.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'SHIFT?' },
  { key: 'eelink_port_get', label: 'Query digital/analog ports', description: 'Read digital input, output, and analog port states.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'PORT?' },
  {
    key: 'eelink_port_set',
    label: 'Set output ports',
    description: 'Set the 4 output port values as a four-digit 0/1 string.',
    category: 'control',
    protocols: ['eelink'],
    fields: [{ key: 'mask', label: 'Port mask', type: 'text', required: true, placeholder: '1000', helpText: 'Four digits, one per output port.' }],
    buildCommand: (values) => {
      const mask = required(values, 'mask', 'Port mask');
      if (!/^[01]{4}$/.test(mask)) throw new Error('Port mask must be exactly four 0/1 digits');
      return withHash(`PORT,${mask}`);
    },
  },
  { key: 'eelink_relay_enable', label: 'Cut oil & power', description: 'Enable the relay cut-off command.', category: 'control', protocols: ['eelink'], fields: [], buildCommand: () => 'RELAY,1#' },
  { key: 'eelink_relay_disable', label: 'Restore oil & power', description: 'Disable the relay cut-off command.', category: 'control', protocols: ['eelink'], fields: [], buildCommand: () => 'RELAY,0#' },
  { key: 'eelink_relay_get', label: 'Query relay status', description: 'Read the relay status.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'RELAY?' },
  {
    key: 'eelink_camera',
    label: 'Trigger camera',
    description: 'Trigger up to four cameras with format values 0-6.',
    category: 'control',
    protocols: ['eelink'],
    fields: [
      { key: 'camera1', label: 'Camera 1', type: 'number', required: true, placeholder: '2' },
      { key: 'camera2', label: 'Camera 2', type: 'number', required: true, placeholder: '0' },
      { key: 'camera3', label: 'Camera 3', type: 'number', required: true, placeholder: '0' },
      { key: 'camera4', label: 'Camera 4', type: 'number', required: true, placeholder: '0' },
    ],
    buildCommand: (values) => withHash(`CAMERA,${numberString(values, 'camera1', 'Camera 1', { integer: true, min: 0, max: 6 })},${numberString(values, 'camera2', 'Camera 2', { integer: true, min: 0, max: 6 })},${numberString(values, 'camera3', 'Camera 3', { integer: true, min: 0, max: 6 })},${numberString(values, 'camera4', 'Camera 4', { integer: true, min: 0, max: 6 })}`),
  },
  { key: 'eelink_camera_get', label: 'Query camera status', description: 'Read the current camera availability/status.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'CAMERA?' },
  { key: 'eelink_reset', label: 'Restart terminal', description: 'Restart the tracker remotely.', category: 'control', protocols: ['eelink'], fields: [], buildCommand: () => 'RESET#' },
  { key: 'eelink_factory', label: 'Restore factory settings', description: 'Restore factory settings on the tracker.', category: 'control', protocols: ['eelink'], fields: [], buildCommand: () => 'FACTORY#' },
  { key: 'eelink_version_get', label: 'Query version', description: 'Read firmware version/build info.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'VERSION?' },
  { key: 'eelink_param_get', label: 'Query parameters', description: 'Read the tracker parameter summary.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'PARAM?' },
  { key: 'eelink_where_get', label: 'Query coordinates', description: 'Read the current coordinate reply.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'WHERE?' },
  { key: 'eelink_status_get', label: 'Query status', description: 'Read battery, GSM, GPS, ACC, relay, and charger state.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'STATUS?' },
  { key: 'eelink_url_get', label: 'Query map link', description: 'Read the current map URL reply.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'URL?' },
  { key: 'eelink_position_get', label: 'Query address', description: 'Read the current address reply.', category: 'query', protocols: ['eelink'], fields: [], buildCommand: () => 'POSITION?' },
  {
    key: 'eelink_forward_sms',
    label: 'Forward SMS query',
    description: 'Forward a text query through the tracker SIM and return the result.',
    category: 'control',
    protocols: ['eelink'],
    fields: [
      { key: 'phone', label: 'Destination number', type: 'text', required: true, placeholder: '10086' },
      { key: 'message', label: 'Message', type: 'text', required: true, placeholder: 'CXYE' },
    ],
    buildCommand: (values) => withHash(`FW,${required(values, 'phone', 'Destination number')},${required(values, 'message', 'Message')}`),
  },
  { key: 'eelink_obd_version', label: 'OBD: Get version', description: 'Read the OBD module version.', category: 'obd', protocols: ['eelink'], fields: [], buildCommand: () => 'OBD,01#' },
  { key: 'eelink_obd_serial', label: 'OBD: Get serial', description: 'Read the OBD module serial number.', category: 'obd', protocols: ['eelink'], fields: [], buildCommand: () => 'OBD,02#' },
  { key: 'eelink_obd_vin', label: 'OBD: Get VIN', description: 'Read the vehicle VIN through OBD.', category: 'obd', protocols: ['eelink'], fields: [], buildCommand: () => 'OBD,03#' },
  {
    key: 'eelink_obd_vehicle_model',
    label: 'OBD: Set vehicle model',
    description: 'Set the OBD vehicle model code.',
    category: 'obd',
    protocols: ['eelink'],
    fields: [{ key: 'modelCode', label: 'Model code', type: 'text', required: true, placeholder: '0200' }],
    buildCommand: (values) => withHash(`OBD,08,${required(values, 'modelCode', 'Model code')}`),
  },
  { key: 'eelink_obd_supported_pids', label: 'OBD: Get supported PIDs', description: 'Query the supported OBD PID groups.', category: 'obd', protocols: ['eelink'], fields: [], buildCommand: () => 'OBD,10#' },
  {
    key: 'eelink_obd_pid_data',
    label: 'OBD: Get PID data',
    description: 'Request one or more OBD PIDs as a continuous hex string.',
    category: 'obd',
    protocols: ['eelink'],
    fields: [{ key: 'pids', label: 'PID hex string', type: 'text', required: true, placeholder: '0020408A8B0C0D0E' }],
    buildCommand: (values) => withHash(`OBD,11,${required(values, 'pids', 'PID hex string')}`),
  },
  { key: 'eelink_obd_freeze_frame', label: 'OBD: Get freeze frame', description: 'Query the available freeze-frame PIDs.', category: 'obd', protocols: ['eelink'], fields: [], buildCommand: () => 'OBD,12#' },
  {
    key: 'eelink_obd_freeze_frame_data',
    label: 'OBD: Get freeze-frame data',
    description: 'Request freeze-frame values for a list of PIDs.',
    category: 'obd',
    protocols: ['eelink'],
    fields: [{ key: 'pids', label: 'PID hex string', type: 'text', required: true, placeholder: '0C0E1C1E' }],
    buildCommand: (values) => withHash(`OBD,13,${required(values, 'pids', 'PID hex string')}`),
  },
  { key: 'eelink_obd_faults', label: 'OBD: Get fault codes', description: 'Read current OBD fault codes.', category: 'obd', protocols: ['eelink'], fields: [], buildCommand: () => 'OBD,14#' },
  { key: 'eelink_obd_clear_faults', label: 'OBD: Clear fault codes', description: 'Clear OBD fault codes.', category: 'obd', protocols: ['eelink'], fields: [], buildCommand: () => 'OBD,15#' },
  {
    key: 'eelink_obd_monitor',
    label: 'OBD: Set monitor PIDs',
    description: 'Configure the live PID monitoring list.',
    category: 'obd',
    protocols: ['eelink'],
    fields: [{ key: 'pids', label: 'PID hex string', type: 'text', required: true, placeholder: '02030405070A0B0C0D0E' }],
    buildCommand: (values) => withHash(`MONITOR,${required(values, 'pids', 'PID hex string')}`),
  },
];

const COMMANDS = [...EELINK_COMMANDS];

export function getCommandCatalogForProtocol(protocol: TrackingProtocol): DeviceCommandDefinition[] {
  if (protocol === 'unknown') return [];
  return COMMANDS.filter((command) => command.protocols.includes(protocol)).map((command) => ({
    key: command.key,
    label: command.label,
    description: command.description,
    category: command.category,
    protocols: command.protocols,
    fields: command.fields,
  }));
}

export function buildCommandContent(protocol: TrackingProtocol, commandKey: string, values: CommandValues): string {
  const definition = COMMANDS.find((command) => command.key === commandKey && command.protocols.includes(protocol));
  if (!definition) {
    throw new Error(`Command "${commandKey}" is not available for protocol ${protocol}`);
  }
  return definition.buildCommand(values);
}
