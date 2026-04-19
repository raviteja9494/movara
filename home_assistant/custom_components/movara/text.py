from __future__ import annotations

from homeassistant.components.text import TextEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_helpers import MovaraCoordinatorEntity
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
            lambda device_id: [MovaraCommandText(coordinator, device_id)],
        )
    )


class MovaraCommandText(MovaraCoordinatorEntity, TextEntity):
    _attr_mode = "text"

    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Custom command"
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_custom_command"
        self._attr_icon = "mdi:console-line"
        self._attr_native_max = 512

    @property
    def native_value(self) -> str:
        return self.coordinator.get_command_text(self._device_id)

    async def async_set_value(self, value: str) -> None:
        self.coordinator.set_command_text(self._device_id, value)
        self.async_write_ha_state()
