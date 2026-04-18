from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_helpers import MovaraCoordinatorEntity, merged_attributes


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = []
    for device in coordinator.data.get("devices", []):
        entities.append(MovaraOnlineBinarySensor(coordinator, device["id"]))
        entities.append(MovaraIgnitionBinarySensor(coordinator, device["id"]))
    async_add_entities(entities)


class MovaraOnlineBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Online"
        self._attr_unique_id = f"movara_{self._device_id}_online"

    @property
    def is_on(self) -> bool:
        device = self._device()
        return bool(device and device.get("status") == "online")


class MovaraIgnitionBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Ignition"
        self._attr_unique_id = f"movara_{self._device_id}_ignition"
        self._attr_icon = "mdi:car-electric"

    @property
    def is_on(self) -> bool | None:
        attrs = merged_attributes(self._device())
        value = attrs.get("ignition")
        return value if isinstance(value, bool) else None
