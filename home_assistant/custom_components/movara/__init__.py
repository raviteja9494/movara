from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import voluptuous as vol
from homeassistant.helpers import config_validation as cv

from .api import MovaraApiClient
from .const import CONF_BASE_URL, CONF_EMAIL, CONF_PASSWORD, CONF_SCAN_INTERVAL, DOMAIN
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
    api = MovaraApiClient(
        session,
        entry.data[CONF_BASE_URL],
        entry.data[CONF_EMAIL],
        entry.data[CONF_PASSWORD],
    )
    coordinator = MovaraDataUpdateCoordinator(
        hass,
        api,
        entry.data[CONF_SCAN_INTERVAL],
        entry.entry_id,
        hub_namespace(entry.data[CONF_BASE_URL]),
    )
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
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


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if not hass.data[DOMAIN] and hass.services.has_service(DOMAIN, SERVICE_SEND_CUSTOM_COMMAND):
            hass.services.async_remove(DOMAIN, SERVICE_SEND_CUSTOM_COMMAND)
    return unload_ok
