from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import MovaraApiClient
from .const import CONF_BASE_URL, CONF_EMAIL, CONF_PASSWORD, CONF_SCAN_INTERVAL, DOMAIN
from .coordinator import MovaraDataUpdateCoordinator

PLATFORMS: list[Platform] = [Platform.BINARY_SENSOR, Platform.SENSOR, Platform.DEVICE_TRACKER]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    session = async_get_clientsession(hass)
    api = MovaraApiClient(
        session,
        entry.data[CONF_BASE_URL],
        entry.data[CONF_EMAIL],
        entry.data[CONF_PASSWORD],
    )
    coordinator = MovaraDataUpdateCoordinator(hass, api, entry.data[CONF_SCAN_INTERVAL])
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok
