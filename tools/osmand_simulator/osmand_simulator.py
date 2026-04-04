#!/usr/bin/env python3
"""
OsmAnd protocol simulator: send all points from a GPX track to Movara's OsmAnd HTTP server (port 5055).
Sends GET requests with id, lat, lon, timestamp, and optional speed. All points are sent in sequence
(with a small delay between requests); script then exits.

Time modes:
  offset (default) — Last point = current time; earlier points back in time (same intervals as GPX). Track "ends" now.
  current          — Same as offset.
  gpx              — Report original GPX timestamps for each point.

Usage:
  python osmand_simulator.py track.gpx [--server HOST] [--port PORT] [--id DEVICE_ID] [--time gpx|current|offset]
  python osmand_simulator.py "path/to/track.gpx" --time gpx

Requires: Python 3.9+ (stdlib only: xml.etree, urllib, datetime).
"""
import argparse
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET

# Defaults (change in script or via CLI)
DEFAULT_SERVER = "127.0.0.1"
DEFAULT_PORT = 5055
DEFAULT_DEVICE_ID = "gpx-sim"
# Time mode: "gpx" = report GPX timestamps; "current" or "offset" = report current time (realtime from now)
DEFAULT_TIME_MODE = "offset"

GPX_NS = {"gpx": "http://www.topografix.com/GPX/1/1"}


def parse_gpx(path: str) -> list[tuple[float, float, datetime | None, float | None]]:
    """Parse GPX file; return list of (lat, lon, time_utc or None, speed_mps or None)."""
    tree = ET.parse(path)
    root = tree.getroot()
    points = []
    for trk in root.findall(".//gpx:trk", GPX_NS):
        for seg in trk.findall("gpx:trkseg", GPX_NS):
            for pt in seg.findall("gpx:trkpt", GPX_NS):
                lat_s = pt.get("lat")
                lon_s = pt.get("lon")
                if lat_s is None or lon_s is None:
                    continue
                try:
                    lat = float(lat_s)
                    lon = float(lon_s)
                except ValueError:
                    continue
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    continue
                time_el = pt.find("gpx:time", GPX_NS)
                dt = None
                if time_el is not None and time_el.text:
                    try:
                        # ISO format; treat as UTC if no Z
                        text = time_el.text.strip().replace("Z", "+00:00")
                        dt = datetime.fromisoformat(text)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        else:
                            dt = dt.astimezone(timezone.utc)
                    except (ValueError, TypeError):
                        pass
                speed_mps = None
                ext = pt.find("gpx:extensions", GPX_NS)
                if ext is not None:
                    speed_el = ext.find("speed")
                    if speed_el is not None and speed_el.text:
                        try:
                            speed_mps = float(speed_el.text)
                        except ValueError:
                            pass
                points.append((lat, lon, dt, speed_mps))
    return points


def dedupe_consecutive(
    points: list[tuple[float, float, datetime | None, float | None]],
) -> list[tuple[float, float, datetime | None, float | None]]:
    """Merge consecutive points with same (lat, lon, time); keep first speed."""
    if not points:
        return []
    out = [points[0]]
    for p in points[1:]:
        prev = out[-1]
        if prev[0] == p[0] and prev[1] == p[1] and prev[2] == p[2]:
            continue
        out.append(p)
    return out


def send_position(
    base_url: str,
    device_id: str,
    lat: float,
    lon: float,
    timestamp: datetime,
    speed_mps: float | None,
) -> None:
    """Send one position to OsmAnd server via GET."""
    ts_iso = timestamp.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    params = {
        "id": device_id,
        "lat": lat,
        "lon": lon,
        "timestamp": ts_iso,
    }
    if speed_mps is not None and speed_mps >= 0:
        params["speed"] = speed_mps
    qs = urllib.parse.urlencode(params)
    url = f"{base_url}?{qs}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}: {resp.read()}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Replay a GPX track to Movara OsmAnd server (HTTP, port 5055).",
        epilog="Time mode: gpx = report GPX timestamps; current/offset = report current time (default).",
    )
    parser.add_argument(
        "gpx",
        metavar="GPX_FILE",
        help="Path to GPX file (track points with optional time and speed).",
    )
    parser.add_argument("--server", default=DEFAULT_SERVER, help=f"OsmAnd server host (default: {DEFAULT_SERVER})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"OsmAnd server port (default: {DEFAULT_PORT})")
    parser.add_argument("--id", dest="device_id", default=DEFAULT_DEVICE_ID, help=f"Device id (default: {DEFAULT_DEVICE_ID})")
    parser.add_argument(
        "--time",
        choices=("gpx", "current", "offset"),
        default=DEFAULT_TIME_MODE,
        help="gpx = use GPX timestamps; current/offset = realtime from now (default: %(default)s)",
    )
    args = parser.parse_args()

    points = parse_gpx(args.gpx)
    if not points:
        print("No track points found in GPX.", file=sys.stderr)
        return 1
    points = dedupe_consecutive(points)
    print(f"Loaded {len(points)} points from {args.gpx}")

    base_url = f"http://{args.server}:{args.port}"
    use_gpx_time = args.time == "gpx"
    first_gpx_time = None
    for p in points:
        if p[2] is not None:
            first_gpx_time = p[2]
            break
    if first_gpx_time is None:
        # No timestamps in GPX: assign 1s spacing from now so we have a timeline
        now = datetime.now(timezone.utc)
        for i, p in enumerate(points):
            points[i] = (p[0], p[1], now + timedelta(seconds=i), p[3])
        first_gpx_time = points[0][2]
        if use_gpx_time:
            use_gpx_time = False
            print("No timestamps in GPX; using current-time-based timestamps.", file=sys.stderr)
    else:
        # Fill missing times so every point has a time (for offset calculation)
        first_idx = next(i for i, p in enumerate(points) if p[2] is not None)
        t0 = points[first_idx][2]
        for i, p in enumerate(points):
            if p[2] is None:
                points[i] = (p[0], p[1], t0 + timedelta(seconds=i - first_idx), p[3])
        first_gpx_time = points[0][2]
    last_gpx_time = points[-1][2]

    # Send all points: for offset/current, last point = now, earlier points back in time (same intervals as GPX)
    report_time_base = datetime.now(timezone.utc) if not use_gpx_time else None
    sent = 0
    for i, (lat, lon, pt_time, speed_mps) in enumerate(points):
        if use_gpx_time:
            report_time = pt_time
        else:
            # last point = now; others = now - (last_gpx_time - pt_time)
            report_time = report_time_base + (pt_time - last_gpx_time)
        try:
            send_position(base_url, args.device_id, lat, lon, report_time, speed_mps)
            sent += 1
            if sent % 100 == 0 or sent == len(points):
                print(f"Sent {sent}/{len(points)}")
        except Exception as e:
            print(f"Error sending point {i + 1}: {e}", file=sys.stderr)
            return 1
        if i < len(points) - 1:
            time.sleep(0.02)  # small delay to avoid overwhelming the server
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
