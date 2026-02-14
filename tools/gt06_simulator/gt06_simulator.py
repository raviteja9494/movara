#!/usr/bin/env python3
"""
GT06 protocol simulator for testing Movara's GT06 server.
Sends login then GPS packets. Uses Movara's expected format:
- Sync 0x78 0x78, length (2 bytes BE), type (1), payload, XOR checksum (1), end 0x0D 0x0A
- Login: type 0x01, payload 8 bytes BCD IMEI
- GPS: type 0x12, payload [status(1), lat(4), lon(4), speed(1), timestamp BCD(6)]
"""
import socket
import time
import sys
from datetime import datetime
import struct

# Configuration (override with env or args)
SERVER = "127.0.0.1"
PORT = 5051
IMEI = "123456789012345"
INTERVAL = 10


def xor_checksum(data: bytes) -> int:
    """GT06 uses 1-byte XOR checksum (not CRC)."""
    c = 0
    for b in data:
        c ^= b
    return c & 0xFF


def imei_to_bcd(imei: str) -> bytes:
    """Encode 15-digit IMEI as 8 bytes BCD (two digits per byte, last nibble 0 if odd)."""
    digits = imei.zfill(16)[:16]  # pad to 16 for 8 bytes
    out = bytearray(8)
    for i in range(8):
        hi = int(digits[i * 2], 10)
        lo = int(digits[i * 2 + 1], 10) if i * 2 + 1 < len(digits) else 0
        out[i] = (hi << 4) | lo
    return bytes(out)


def create_login_packet() -> bytes:
    # Length = 1 (type) + 8 (IMEI) = 9
    payload = imei_to_bcd(IMEI)
    body = bytes([0x01]) + payload  # type + payload
    length = len(body)
    packet = bytearray([0x78, 0x78])
    packet.extend(struct.pack(">H", length))
    packet.extend(body)
    packet.append(xor_checksum(packet[2:]))
    packet.extend([0x0D, 0x0A])
    return bytes(packet)


def date_to_bcd(dt: datetime) -> bytes:
    """6 bytes BCD: YY MM DD HH MM SS."""
    return bytes([
        (dt.year - 2000) // 10 << 4 | (dt.year - 2000) % 10,
        dt.month // 10 << 4 | dt.month % 10,
        dt.day // 10 << 4 | dt.day % 10,
        dt.hour // 10 << 4 | dt.hour % 10,
        dt.minute // 10 << 4 | dt.minute % 10,
        dt.second // 10 << 4 | dt.second % 10,
    ])


def create_gps_packet(lat: float = 12.9716, lon: float = 77.5946, speed_kmh: int = 25) -> bytes:
    # Movara parser: payload[0]=status, [1-4]=lat (degrees*1e6), [5-8]=lon, [9]=speed, [10-15]=BCD time
    now = datetime.utcnow()
    status = 0x01  # fix
    lat_int = min(0xFFFFFFFF, max(0, int(abs(lat) * 1_000_000)))
    lon_int = min(0xFFFFFFFF, max(0, int(abs(lon) * 1_000_000)))
    if lat < 0:
        lat_int = (1 << 32) - lat_int  # two's complement for negative not in parser; use positive for test
    if lon < 0:
        lon_int = (1 << 32) - lon_int
    payload = bytearray([
        status,
        *struct.pack(">I", lat_int & 0xFFFFFFFF),
        *struct.pack(">I", lon_int & 0xFFFFFFFF),
        min(255, max(0, speed_kmh)),
    ])
    payload.extend(date_to_bcd(now))
    assert len(payload) == 16

    body = bytes([0x12]) + payload  # type 0x12 = GPS
    length = len(body)
    packet = bytearray([0x78, 0x78])
    packet.extend(struct.pack(">H", length))
    packet.extend(body)
    packet.append(xor_checksum(packet[2:]))
    packet.extend([0x0D, 0x0A])
    return bytes(packet)


def main():
    global SERVER, PORT, IMEI, INTERVAL
    args = sys.argv[1:]
    once = "--once" in args or "-1" in args
    args = [a for a in args if a not in ("--once", "-1")]
    if len(args) >= 1:
        SERVER = args[0]
    if len(args) >= 2:
        PORT = int(args[1])

    print(f"GT06 Simulator -> {SERVER}:{PORT} (IMEI={IMEI}, interval={INTERVAL}s)")
    if once:
        print("Single run (login + 1 GPS)\n")
    else:
        print("Press Ctrl+C to stop\n")

    while True:
        try:
            with socket.create_connection((SERVER, PORT), timeout=10) as s:
                print("Connected")
                login = create_login_packet()
                s.sendall(login)
                print(f"Login sent ({len(login)} bytes)")

                gps = create_gps_packet()
                s.sendall(gps)
                print(f"GPS sent ({len(gps)} bytes)")
                if once:
                    return
                while True:
                    time.sleep(INTERVAL)
                    gps = create_gps_packet()
                    s.sendall(gps)
                    print(f"GPS sent ({len(gps)} bytes)")
        except Exception as e:
            print(f"Error: {e}. Retrying in 5s...")
            time.sleep(5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped")
