# GT06 protocol

Movara accepts GT06-compatible GPS tracker data over TCP. This doc describes packet layout, parser behavior, and how to test with the simulator.

## Server

- **Component**: `src/modules/tracking/infrastructure/protocols/gt06/Gt06Server.ts`
- **Port**: 5051 (default)
- **Role**: Accept connections, feed raw bytes to protocol handler, write ACK responses.

## Packet structure

```
[Sync:2] [Length:2] [Type:1] [Payload:*] [Checksum:1] [End:2]
 0x78 78   (big-endian)  (0x01/0x12/0x13)          (XOR)      0x0D 0x0A
```

- **Sync**: `0x78 0x78`
- **Length**: 2 bytes big-endian = length of (Type + Payload)
- **Type**: 1 byte — `0x01` Login, `0x12` GPS, `0x13` Heartbeat
- **Payload**: variable
- **Checksum**: 1 byte XOR over (Length + Type + Payload)
- **End**: `0x0D 0x0A`

## Message types

| Type | Hex | Description |
|------|-----|-------------|
| Login | 0x01 | Device registration; payload = 8 bytes BCD IMEI (15 digits, padded) |
| GPS | 0x12 | Location report; see payload layout below |
| Heartbeat | 0x13 | Keep-alive |

## GPS payload layout (type 0x12)

Used by parser and simulator:

- **Status**: 1 byte
- **Latitude**: 4 bytes big-endian, unsigned, microdegrees (degrees × 1e6)
- **Longitude**: 4 bytes big-endian, unsigned, microdegrees
- **Speed**: 1 byte (e.g. km/h)
- **Timestamp**: 6 bytes BCD (YY MM DD HH MM SS)

Parser returns a DTO with `latitude`, `longitude`, `speed`, `timestamp` (and IMEI when available). IMEI is also stored per connection from login so GPS can be attributed after login.

## Parser and protocol

- **Parser**: `Gt06Parser.ts` — validates sync, end, length, XOR checksum; decodes payloads; returns structured packet DTO. No DB or business logic.
- **Protocol**: `Gt06Protocol.ts` — routes by message type; uses IMEI-per-connection for GPS; calls `ProcessIncomingPositionUseCase` for GPS; returns ACK buffers for login and heartbeat.
- **ACK builder**: `Gt06Acker.ts` — builds response packets (sync, length, type, payload, XOR checksum, end).

## Simulator

**Location**: `tools/gt06_simulator/gt06_simulator.py`

**Purpose**: Send correct GT06 login + GPS packets to test the server.

**Usage**:

```bash
# Default: SERVER=127.0.0.1, PORT=5051, IMEI=123456789012345
python tools/gt06_simulator/gt06_simulator.py

# One-shot: login + one GPS then exit
python tools/gt06_simulator/gt06_simulator.py --once
```

**Requirements**: Python 3. No extra packages. Override via env: `SERVER`, `PORT`, `IMEI`, `INTERVAL` (seconds between GPS packets).

**Packet format**: Sync 0x78 0x78, length (BE), type, payload, XOR checksum, 0x0D 0x0A. Login = type 0x01 + 8-byte BCD IMEI. GPS = type 0x12 with status, lat (4 bytes), lon (4 bytes), speed (1), BCD time (6).

## Data flow

1. TCP bytes → **Gt06Server** → **Gt06Protocol.handleMessage** (with connectionId for IMEI mapping).
2. **Gt06Parser** validates and decodes → DTO with type and payload/decoded fields.
3. Login: store IMEI for connection; respond with ACK.
4. GPS: resolve device (IMEI from login or payload); **ProcessIncomingPositionUseCase** → validate, deduplicate, persist, emit events; no ACK required for GPS.
5. Heartbeat: respond with ACK.
