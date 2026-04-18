from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_helpers import MovaraCoordinatorEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [MovaraSendCommandButton(coordinator, device["id"]) for device in coordinator.data.get("devices", [])]
    )


class MovaraSendCommandButton(MovaraCoordinatorEntity, ButtonEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Send custom command"
        self._attr_unique_id = f"movara_{device_id}_send_custom_command"
        self._attr_icon = "mdi:send"

    async def async_press(self) -> None:
        await self.coordinator.async_send_stored_command(self._device_id)
