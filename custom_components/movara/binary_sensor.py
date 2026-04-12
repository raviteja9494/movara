from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([MovaraOnlineBinarySensor(coordinator, device) for device in coordinator.data.get("devices", [])])


class MovaraOnlineBinarySensor(CoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device: dict) -> None:
        super().__init__(coordinator)
        self._device_id = device["id"]
        self._attr_name = f"{device.get('name') or device.get('imei')} online"
        self._attr_unique_id = f"movara_{self._device_id}_online"

    @property
    def is_on(self) -> bool:
        device = next((item for item in self.coordinator.data.get("devices", []) if item["id"] == self._device_id), None)
        return bool(device and device.get("status") == "online")

    @property
    def device_info(self):
        device = next((item for item in self.coordinator.data.get("devices", []) if item["id"] == self._device_id), None)
        return {
            "identifiers": {(DOMAIN, self._device_id)},
            "name": device.get("name") or device.get("imei"),
            "manufacturer": "Movara",
            "model": device.get("protocol") or "Tracker",
        } if device else None
