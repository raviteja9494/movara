from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import voluptuous as vol
from homeassistant.helpers import config_validation as cv

from .api import MovaraApiClient
from .const import (
    CONF_ACTIVE_HOLD_SECONDS,
    CONF_ACTIVE_SCAN_INTERVAL,
    CONF_BASE_URL,
    CONF_EMAIL,
    CONF_PASSWORD,
    CONF_SCAN_INTERVAL,
    DEFAULT_ACTIVE_HOLD_SECONDS,
    DEFAULT_ACTIVE_SCAN_INTERVAL,
    DOMAIN,
)
from .coordinator import MovaraDataUpdateCoordinator
from .hub import hub_namespace

PLATFORMS: list[Platform] = [
    Platform.BINARY_SENSOR,
    Platform.SENSOR,
    Platform.DEVICE_TRACKER,
    Platform.TEXT,
    Platform.BUTTON,
]
SERVICE_SEND_CUSTOM_COMMAND = "send_custom_command"
SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required("device_id"): cv.string,
        vol.Required("command_text"): cv.string,
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    session = async_get_clientsession(hass)
    options = entry.options
    api = MovaraApiClient(
        session,
        entry.data[CONF_BASE_URL],
        entry.data[CONF_EMAIL],
        entry.data[CONF_PASSWORD],
    )
    coordinator = MovaraDataUpdateCoordinator(
        hass,
        api,
        options.get(CONF_SCAN_INTERVAL, entry.data[CONF_SCAN_INTERVAL]),
        options.get(CONF_ACTIVE_SCAN_INTERVAL, DEFAULT_ACTIVE_SCAN_INTERVAL),
        options.get(CONF_ACTIVE_HOLD_SECONDS, DEFAULT_ACTIVE_HOLD_SECONDS),
        entry.entry_id,
        hub_namespace(entry.data[CONF_BASE_URL]),
    )
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    if not hass.services.has_service(DOMAIN, SERVICE_SEND_CUSTOM_COMMAND):
        async def async_handle_send_custom_command(call) -> None:
            device_id = call.data["device_id"]
            command_text = call.data["command_text"]
            for stored_coordinator in hass.data.get(DOMAIN, {}).values():
                device = next((item for item in stored_coordinator.data.get("devices", []) if item["id"] == device_id), None)
                if not device:
                    continue
                stored_coordinator.set_command_text(device_id, command_text)
                await stored_coordinator.async_send_stored_command(device_id)
                return
            raise ValueError(f"Movara device {device_id} not found")

        hass.services.async_register(
            DOMAIN,
            SERVICE_SEND_CUSTOM_COMMAND,
            async_handle_send_custom_command,
            schema=SERVICE_SCHEMA,
        )
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if not hass.data[DOMAIN] and hass.services.has_service(DOMAIN, SERVICE_SEND_CUSTOM_COMMAND):
            hass.services.async_remove(DOMAIN, SERVICE_SEND_CUSTOM_COMMAND)
    return unload_ok
