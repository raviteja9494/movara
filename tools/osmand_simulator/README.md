# OsmAnd GPX Simulator

Sends **all** points from a GPX track to Movara's OsmAnd HTTP server (port 5055). Sends GET requests with `id`, `lat`, `lon`, `timestamp`, and optional `speed`. Points are sent in sequence (small delay between requests); script then exits. Device appears as `osmand-{id}` (e.g. `osmand-gpx-sim`).

**Requirements:** Python 3.9+ (stdlib only).

## Time modes

| Option     | Description |
|-----------|-------------|
| **offset** (default) | **Last point = current time**; earlier points are set back in time (same intervals as GPX). Track "ends" now. |
| **current**         | Same as offset. |
| **gpx**             | Report **original GPX timestamps** for each point. |

Change the default in the script by editing `DEFAULT_TIME_MODE = "gpx"` if you prefer GPX timestamps by default.

## Usage

```bash
# Default: 127.0.0.1:5055, device id gpx-sim, time mode offset (current time)
python osmand_simulator.py path/to/track.gpx

# Use original GPX timestamps
python osmand_simulator.py track.gpx --time gpx

# Custom server and device id
python osmand_simulator.py track.gpx --server 192.168.1.10 --port 5055 --id my-device
```

**Example (your file):**

```bash
python osmand_simulator.py "C:\Users\Teja\Downloads\track-Teja-Mobile-1771250693582.gpx"
python osmand_simulator.py "C:\Users\Teja\Downloads\track-Teja-Mobile-1771250693582.gpx" --time gpx
```

Ensure Movara backend is running and the OsmAnd server is listening on port 5055.
