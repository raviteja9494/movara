# Home Assistant Integration

Movara supports Home Assistant through the custom integration in `custom_components/movara`.

## Recommended: Custom Integration

The custom integration connects Home Assistant directly to the Movara API and creates entities for your trackers and vehicles.

### What it exposes

- tracker online/offline binary sensors
- tracker ignition binary sensors
- tracker location device trackers
- last seen, speed, battery, signal, command status, and command response sensors
- vehicle latest trip sensors: trip id, distance, duration, average speed, max speed, start time, and end time
- per-device custom command text boxes and send buttons

### Install

1. Copy `custom_components/movara` into your Home Assistant `custom_components/` folder.
2. Restart Home Assistant.
3. In Home Assistant, go to `Settings -> Devices & Services -> Add Integration`.
4. Search for `Movara`.
5. Enter:
   - your Movara base URL, for example `http://movara.local:3000`
   - your Movara login email
   - your Movara login password
   - a scan interval in seconds

### Install with HACS as a custom repository

1. Open HACS in Home Assistant.
2. Go to `HACS -> Integrations -> menu -> Custom repositories`.
3. Add `https://github.com/raviteja9494/movara` as an `Integration` repository.
4. Search for `Movara` in HACS and install it.
5. Restart Home Assistant.
6. Add the `Movara` integration from `Settings -> Devices & Services`.

### Repository layout note

The HACS-compatible install path is now stored directly at `custom_components/movara` in the repository root. The older `home_assistant/custom_components/movara` path is kept in the repo as a development copy, but HACS and manual installs should use the root `custom_components` directory.

### Notes

- If the integration icon does not update after installing a new version, restart Home Assistant and hard-refresh the browser. HACS may also need the integration to be re-downloaded because it can cache custom integration assets.
- The integration polls Movara. No Home Assistant REST push setup is needed.
- Polling intervals can be changed from the integration options. The parked interval is used normally; the ignition-on interval is used while any tracker reports ignition on and for the configured hold time after ignition turns off.
- Polling uses `GET /api/v1/home-assistant/snapshot`, which returns tracker state, vehicle data, and latest vehicle trip summaries in one request.
- It uses normal Movara API authentication.
- New tracker entities appear after the next refresh once the tracker exists in Movara.
- New vehicle entities appear after the next refresh once the vehicle exists in Movara.
- IMEI and protocol now live in Home Assistant device details instead of separate sensors.
- It also exposes the latest command status and latest command response for each tracker.
- It gives each tracker a `Custom command` text entity and `Send custom command` button, and still registers a `movara.send_custom_command` service for automations or scripts.
