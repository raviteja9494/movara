#!/usr/bin/env python3
"""
GT06 protocol simulator for testing Movara's GT06 server.
Simulates one device moving at constant speed from a fixed start position.
Sends login then GPS packets at INTERVAL; each packet uses current position
advanced by (speed * interval) in a fixed bearing. No random positions.

Env (optional): GT06_SERVER, GT06_PORT, GT06_IMEI, GT06_INTERVAL,
  GT06_START_LAT, GT06_START_LON, GT06_SPEED_KMH, GT06_BEARING (0=North, 90=East)
Usage: python gt06_simulator.py [SERVER [PORT]]   # run until Ctrl+C
       python gt06_simulator.py --once             # login + one GPS then exit

Protocol: Sync 0x78 0x78, length (2 bytes BE), type (1), payload, XOR checksum (1), end 0x0D 0x0A
- Login: type 0x01, payload 8 bytes BCD IMEI
- GPS: type 0x12, payload [status(1), lat(4), lon(4), speed(1), timestamp BCD(6)]
"""
import math
import socket
import time
import sys
import os
from datetime import datetime
import struct

# Configuration (override with env or args)
SERVER = os.environ.get("GT06_SERVER", "127.0.0.1")
PORT = int(os.environ.get("GT06_PORT", "5051"))
IMEI = os.environ.get("GT06_IMEI", "123456789012345")
INTERVAL = int(os.environ.get("GT06_INTERVAL", "10"))
# Start position (degrees)
START_LAT = float(os.environ.get("GT06_START_LAT", "12.9716"))
START_LON = float(os.environ.get("GT06_START_LON", "77.5946"))
# Constant speed (km/h) and bearing (degrees: 0=North, 90=East)
SPEED_KMH = float(os.environ.get("GT06_SPEED_KMH", "50"))
BEARING_DEG = float(os.environ.get("GT06_BEARING", "0"))


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


def advance_position(lat: float, lon: float, distance_km: float, bearing_deg: float) -> tuple[float, float]:
    """Move (lat, lon) by distance_km in direction bearing_deg (0=North, 90=East). Returns (new_lat, new_lon)."""
    # Approximate: 1 deg lat ≈ 111.32 km; 1 deg lon ≈ 111.32 * cos(lat) km
    br = math.radians(bearing_deg)
    dy_km = distance_km * math.cos(br)
    dx_km = distance_km * math.sin(br)
    lat_rad = math.radians(lat)
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * math.cos(lat_rad) if abs(lat) != 90 else 1e-9
    new_lat = lat + (dy_km / km_per_deg_lat)
    new_lon = lon + (dx_km / km_per_deg_lon)
    return (new_lat, new_lon)


def create_gps_packet(lat: float, lon: float, speed_kmh: float) -> bytes:
    # Movara parser: payload[0]=status, [1-4]=lat (degrees*1e6), [5-8]=lon, [9]=speed, [10-15]=BCD time
    now = datetime.utcnow()
    status = 0x01  # fix
    lat_int = min(0xFFFFFFFF, max(0, int(abs(lat) * 1_000_000)))
    lon_int = min(0xFFFFFFFF, max(0, int(abs(lon) * 1_000_000)))
    if lat < 0:
        lat_int = (1 << 32) - lat_int  # two's complement for negative not in parser; use positive for test
    if lon < 0:
        lon_int = (1 << 32) - lon_int
    speed_byte = min(255, max(0, int(round(speed_kmh))))
    payload = bytearray([
        status,
        *struct.pack(">I", lat_int & 0xFFFFFFFF),
        *struct.pack(">I", lon_int & 0xFFFFFFFF),
        speed_byte,
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
    global SERVER, PORT, IMEI, INTERVAL, START_LAT, START_LON, SPEED_KMH, BEARING_DEG
    args = sys.argv[1:]
    once = "--once" in args or "-1" in args
    args = [a for a in args if a not in ("--once", "-1")]
    if len(args) >= 1:
        SERVER = args[0]
    if len(args) >= 2:
        PORT = int(args[1])

    distance_per_interval_km = SPEED_KMH * (INTERVAL / 3600.0)
    print(f"GT06 Simulator -> {SERVER}:{PORT} (IMEI={IMEI})")
    print(f"Start: ({START_LAT:.6f}, {START_LON:.6f}) | Speed: {SPEED_KMH} km/h | Bearing: {BEARING_DEG}° | Interval: {INTERVAL}s")
    if once:
        print("Single run (login + 1 GPS)\n")
    else:
        print("Device moves at constant speed until Ctrl+C.\n")

    lat, lon = START_LAT, START_LON

    while True:
        try:
            with socket.create_connection((SERVER, PORT), timeout=10) as s:
                print("Connected")
                login = create_login_packet()
                s.sendall(login)
                print(f"Login sent ({len(login)} bytes)")

                gps = create_gps_packet(lat, lon, SPEED_KMH)
                s.sendall(gps)
                print(f"GPS sent lat={lat:.6f} lon={lon:.6f} speed={SPEED_KMH:.0f} km/h")
                if once:
                    return
                while True:
                    time.sleep(INTERVAL)
                    lat, lon = advance_position(lat, lon, distance_per_interval_km, BEARING_DEG)
                    gps = create_gps_packet(lat, lon, SPEED_KMH)
                    s.sendall(gps)
                    print(f"GPS sent lat={lat:.6f} lon={lon:.6f} speed={SPEED_KMH:.0f} km/h")
        except Exception as e:
            print(f"Error: {e}. Retrying in 5s...")
            time.sleep(5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped")
