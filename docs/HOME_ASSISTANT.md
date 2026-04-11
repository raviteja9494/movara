# Home Assistant Integration

Movara now includes an initial Home Assistant push integration.

## What it does

When enabled, Movara mirrors live tracker state into Home Assistant by calling the Home Assistant REST state API.

It publishes:

- device online/offline status
- protocol
- last seen timestamp
- IMEI
- latest latitude
- latest longitude
- latest speed
- primitive tracker attributes from the current device state
- primitive packet-specific attributes from the latest parsed packet snapshots

That means values like these can appear automatically when the tracker sends them:

- ignition
- charging
- gps_fix
- battery_percent
- gsm_signal_percent
- rpm
- coolant_temp
- fuel_level
- protocol-specific packet attributes such as `packet_0x07_ignition`

## Configuration

Set these environment variables for the Movara backend:

```env
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your_long_lived_access_token
```

The integration stays disabled unless both values are present.

## How it works

- Movara listens to tracking events such as:
  - `position.recorded`
  - `device.telemetry`
  - `device.online`
  - `device.offline`
- On each event, Movara rebuilds the current state for that tracker from:
  - the live device-state cache
  - the latest stored position
- Each state is pushed to Home Assistant using:
  - `POST /api/states/<entity_id>`

This is intentionally a simple first version:

- no MQTT required
- no custom Home Assistant component required
- no discovery registry yet

## Entity naming

Entities use a slugged device name or IMEI.

Examples:

- `binary_sensor.movara_teja_car_tracker_online`
- `sensor.movara_teja_car_tracker_protocol`
- `sensor.movara_teja_car_tracker_last_seen`
- `sensor.movara_teja_car_tracker_latitude`
- `sensor.movara_teja_car_tracker_longitude`
- `sensor.movara_teja_car_tracker_speed`
- `binary_sensor.movara_teja_car_tracker_ignition`
- `sensor.movara_teja_car_tracker_battery_percent`
- `sensor.movara_teja_car_tracker_packet_0x07_ignition`

## Installation steps

1. Create a long-lived access token in Home Assistant.
2. Add `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` to the Movara backend environment.
3. Restart the Movara backend.
4. Let a tracker connect or send telemetry.
5. In Home Assistant, open **Developer Tools → States** and search for `movara_`.

## Notes

- This version pushes entity state only. It does not create a full Home Assistant device registry entry.
- Entity availability depends on actual tracker data. If a tracker never sends a field, that entity will not appear.
- Packet-specific entities are derived from the latest parsed packet snapshot, so they are helpful for debugging and protocol validation.
- If Home Assistant is unreachable or rejects a state update, Movara logs a warning and continues normal tracker processing.

## Future improvements

Possible next steps:

- MQTT discovery support
- a true Home Assistant custom integration
- grouped device metadata
- command entities / buttons
- vehicle-linked sensors
- location/device tracker entities for map views
