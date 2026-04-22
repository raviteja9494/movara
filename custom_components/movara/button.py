from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_helpers import MovaraCoordinatorEntity, device_supports_custom_commands
from .platform_setup import async_add_coordinator_entities


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entry.async_on_unload(
        async_add_coordinator_entities(
            coordinator,
            async_add_entities,
            lambda device: [MovaraSendCommandButton(coordinator, device["id"])] if device_supports_custom_commands(device) else [],
        )
    )


class MovaraSendCommandButton(MovaraCoordinatorEntity, ButtonEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Send custom command"
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_send_custom_command"
        self._attr_icon = "mdi:send"

    @property
    def available(self) -> bool:
        return super().available and device_supports_custom_commands(self._device())

    async def async_press(self) -> None:
        await self.coordinator.async_send_stored_command(self._device_id)
