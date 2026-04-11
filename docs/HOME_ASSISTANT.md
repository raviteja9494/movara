# Home Assistant Integration

Movara now supports two Home Assistant paths:

- a true custom integration in `home_assistant/custom_components/movara`
- an optional REST push bridge configured from the Movara Settings page

## Recommended: Custom Integration

The custom integration connects Home Assistant directly to the Movara API and creates entities for your trackers.

### What it exposes

- tracker online/offline binary sensors
- tracker location device trackers
- protocol, IMEI, last seen, and speed sensors

### Install

1. Copy `home_assistant/custom_components/movara` into your Home Assistant `custom_components/` folder.
2. Restart Home Assistant.
3. In Home Assistant, go to `Settings -> Devices & Services -> Add Integration`.
4. Search for `Movara`.
5. Enter:
   - your Movara base URL, for example `http://movara.local:3000`
   - your Movara login email
   - your Movara login password
   - a scan interval in seconds

### Notes

- The integration polls Movara, so it works even if the optional push bridge is disabled.
- It uses normal Movara API authentication.
- New tracker entities appear after the next refresh once the tracker exists in Movara.

## Optional: REST Push Bridge

Movara can also mirror live tracker state into Home Assistant by calling Home Assistant's REST state API.

This is useful when you want extra low-latency state pushes or quick prototyping, but it is no longer the only integration path.

### Configure from the Movara UI

Open `Settings` in Movara and use the `Home Assistant push` section to set:

- Home Assistant URL
- long-lived access token
- enabled/disabled state

No environment variables are required for normal use anymore. Existing `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` values are still used as defaults if they were already set, and you can then change them from the UI.

### What the push bridge publishes

- online/offline status
- protocol
- last seen
- IMEI
- latest latitude and longitude
- latest speed
- primitive tracker attributes from live telemetry

## Which one should you use?

- Use the custom integration if you want the proper Home Assistant experience.
- Use the REST push bridge if you specifically want Movara to push states into Home Assistant.
- You can run both together, but most setups should start with the custom integration.
