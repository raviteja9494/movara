# Protocols

Movara accepts GPS data from **GT06** (TCP), **Eelink** (TCP), and **OsmAnd / Traccar Client** (HTTP). This doc describes them and the available debugging options.

---

## GT06 (TCP, port 5023)

## Server

- **Component**: `src/modules/tracking/infrastructure/protocols/gt06/Gt06Server.ts`
- **Port**: 5023 (default)
- **Role**: Accept connections, feed raw bytes to the protocol handler, and write ACK responses.
- **TCP buffer**: Per-socket accumulation handles fragmented or merged TCP chunks correctly; full packets are extracted and processed one by one.
- **Connection key**: Connections are keyed by an incrementing connection id (not `remoteAddress:port`) to avoid key reuse issues.
- **Idle timeout**: 10 minutes.
- **Max connections**: 2000.

## Packet structure

```text
[Sync:2] [Length:1] [Type:1] [Payload:*] [Serial:2] [CRC:2] [End:2]
 0x78 78               (0x01/0x13/0x22)                      0x0D 0x0A
```

- **Sync**: `0x78 0x78`
- **Length**: 1 byte = length of `(type + payload + serial + crc)`
- **Type**: 1 byte, for example `0x01` login, `0x13` heartbeat, `0x22` GPS / status
- **Payload**: variable
- **Serial**: 2 bytes sequence number used in ACKs
- **Checksum**: 2 bytes CRC16
- **End**: `0x0D 0x0A`

## Message types

| Type | Hex | Description |
|------|-----|-------------|
| Login | `0x01` | Device registration; payload contains BCD IMEI |
| Heartbeat | `0x13` | Keep-alive / basic terminal status |
| GPS | `0x12`, `0x22` | Location report; device variants differ |
| Status | `0x19` and others | Device-specific status / alarm packets |

## GPS decoding notes

- Movara stores IMEI per connection after login so later GPS packets can be attributed correctly.
- Current GT06 parsing supports the login, heartbeat, and common GPS variants seen in real devices and the bundled simulator.
- Optional GT06 telemetry is normalized into `Position.attributes`, for example:
  - `ignition`
  - `charging`
  - `defense_armed`
  - `gps_tracking`
  - `battery_level`
  - `gsm_signal_percent`
- These values stay optional and do not require new database columns.

## Parser and protocol

- **Parser**: `Gt06Parser.ts` validates sync, length, CRC16, and end bytes, then decodes the payload into a structured DTO.
- **Protocol**: `Gt06Protocol.ts` routes by packet type, manages IMEI-per-connection, calls `ProcessIncomingPositionUseCase` for GPS packets, and returns ACK buffers for login and heartbeat.
- **ACK builder**: `Gt06Acker.ts` builds GT06 ACK packets with serial number and CRC16.

## Simulator

**Location**: `tools/gt06_simulator/gt06_simulator.py`

**Purpose**: Simulate one device moving at constant speed from a fixed start position. Sends login first, then GPS packets at each interval. One-shot mode sends login plus one GPS point and exits.

**Usage**:

```bash
python tools/gt06_simulator/gt06_simulator.py
python tools/gt06_simulator/gt06_simulator.py --once
```

**Config (env)**: `GT06_SERVER`, `GT06_PORT`, `GT06_IMEI`, `GT06_INTERVAL`, `GT06_START_LAT`, `GT06_START_LON`, `GT06_SPEED_KMH`, `GT06_BEARING`.

## Data flow

1. TCP bytes -> `Gt06Server` -> `Gt06Protocol.handleMessage`.
2. `Gt06Parser` validates and decodes -> structured packet DTO.
3. Login: store IMEI for the connection and ACK.
4. GPS: resolve device (IMEI from login or payload), persist through `ProcessIncomingPositionUseCase`.
5. Heartbeat: update device reachability and ACK.

### Notes

- If a GT06 device is linked to a vehicle and sends ignition state, Movara can create or close stored trips automatically from those ignition events.
- Ignition and telemetry are optional. Devices that only send location continue to work normally.

---

## Eelink (configurable on 5064)

## Server

- **Component**: `src/modules/tracking/infrastructure/protocols/eelink/EelinkServer.ts`
- **Port**: `5064` by default
- **Role**: Accept Eelink-family plain TCP connections, extract stream packets, and feed them into the Eelink protocol handler.
- **Idle timeout**: 10 minutes.
- **Max connections**: 2000.

## Packet structure

```text
[Mark:2] [PID:1] [Size:2] [Sequence:2] [Content:*]
 0x67 67
```

- **Mark**: `0x67 0x67`
- **PID**: package identifier, for example `0x01` login, `0x03` heartbeat, `0x12` location, `0x15` ACC report, `0x17` OBD data
- **Size**: 2-byte big-endian length of `(sequence + content)`
- **Sequence**: 2-byte request/response sequence number
- **Content**: variable package content

## Message types

| Type | Hex | Description |
|------|-----|-------------|
| Login | `0x01` | Verified from real logs; payload includes IMEI and optional metadata |
| Compact location | `0x02` | Verified from vendor PDF and drive logs; GPS + LBS + 1-byte location status |
| Heartbeat | `0x03` | Generic Eelink heartbeat packet; supported but not yet observed from this device |
| Status | `0x07` | Verified from real logs as a short status packet with status bits, GSM level, and battery percent |
| Ping | `0x08` | Verified from real logs as an empty keep-alive packet |
| Location | `0x12` | Supported generic Eelink location packet; not yet observed from this device |
| Warning | `0x14` | Supported generic Eelink warning packet; not yet observed from this device |
| Report | `0x15` | Supported generic Eelink report packet; not yet observed from this device |
| OBD | `0x17` | Supported generic Eelink OBD packet; not yet observed from this device |
| LBS | `0x91` | Verified from real logs as a cell-tower / LBS packet with serving and neighbor cells |

## Decoding notes

- Movara stores IMEI per Eelink TCP connection after login so later heartbeat / location / OBD packets without IMEI can still be attached to the device.
- This OBD tracker variant is currently verified from real traffic to use `0x01`, `0x02`, `0x07`, `0x08`, and `0x91`.
- Some Eelink / G500M devices use compact `0x02` GPS packets plus `0x07` status and `0x91` LBS packets instead of the richer `0x12` / `0x17` family.
- `0x09` has been seen once in real traffic, but its content for this device is still unverified, so Movara does not decode it yet.
- Eelink status bits are normalized into attributes such as:
  - `ignition`
  - `charging`
  - `gps_fix`
  - `device_active`
  - `obd_module_running`
  - `din0` to `din3`
- Location packets also normalize:
  - `battery_voltage`
  - `odometer`
  - `temperature_c`
  - `humidity_percent`
  - `illuminance_lux`
  - `co2_ppm`
- Generic `0x17` OBD packets keep a concise raw PID summary in `eelink_obd_groups` and decode common values like:
  - `rpm`
  - `obd_speed`
  - `fuel_level`
  - `coolant_temp`
  - `control_module_voltage`

## Data flow

1. TCP bytes -> `EelinkServer` -> `EelinkProtocol.handleMessage`
2. `EelinkParser` validates framing and decodes login / heartbeat / location / report / OBD content
3. Login: ensure device exists and send login ACK
4. Heartbeat / report: update live device telemetry and ignition state
5. Location / OBD: persist position through `ProcessIncomingPositionUseCase`
6. Telemetry flows into device state and ignition-based auto-trip logic

---

## OsmAnd / Traccar Client (HTTP, port 5055)

- **Component**: `src/modules/tracking/infrastructure/protocols/osmand/OsmAndServer.ts`
- **Port**: 5055 (default)
- **Role**: HTTP server (GET or POST). Accepts query or form params such as `id`, `lat`, `lon`, `timestamp`, `speed`, and JSON payloads from Traccar Client / Background Geolocation.
- **Batch support**: JSON `locations` arrays are supported.
- **Device id**: saved as `osmand-{id}`.
- **Extras**: accuracy, altitude, battery, activity, and other optional fields are stored in `Position.attributes`.

### Timestamp behavior

- Movara stores the event time from the received record when present.
- Delayed or buffered uploads keep their original point timestamps.
- Device `lastSeen` still uses actual server receive time.
- If a received timestamp is too far in the future, Movara clamps it to receive time and marks the saved attributes.

### OsmAnd GPX Simulator

**Location**: `tools/osmand_simulator/osmand_simulator.py`

**Purpose**: Send all points from a GPX track to the OsmAnd server. Supports original GPX time or replayed current-time offsets.

**Usage**:

```bash
python tools/osmand_simulator/osmand_simulator.py track.gpx
python tools/osmand_simulator/osmand_simulator.py track.gpx --time gpx --server 127.0.0.1 --port 5055 --id gpx-sim
```

---

## Debugging

### Raw log (PostgreSQL)

Protocol traffic is persisted in PostgreSQL and trimmed to the latest 500 entries. Use:

- `GET /api/v1/raw-log`
- `DELETE /api/v1/raw-log`

Raw log entries indicate whether they are a received socket `chunk` or an extracted `packet`.

### Protocol debug files (persistent)

For deeper debugging, runtime file logging is enabled by default. You can control it with:

```bash
PROTOCOL_DEBUG=true
PROTOCOL_DEBUG_DIR=./protocol-logs
```

Movara will then write daily `.jsonl` files such as:

- `gt06-2026-03-28.jsonl`
- `eelink-2026-03-28.jsonl`
- `osmand-2026-03-28.jsonl`

These files include structured entries such as raw chunks, extracted packets, ACKs, parse outcomes, and position persistence results. Movara keeps the latest 4 daily files per log type automatically. This is a runtime toggle, so restart the app after changing the env vars, but no rebuild is required.
