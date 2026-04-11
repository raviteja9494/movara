from __future__ import annotations

from homeassistant.components.device_tracker.config_entry import TrackerEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([MovaraDeviceTracker(coordinator, device["id"]) for device in coordinator.data.get("devices", [])])


class MovaraDeviceTracker(CoordinatorEntity, TrackerEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator)
        self._device_id = device_id
        self._attr_unique_id = f"movara_{device_id}_tracker"

    def _device(self) -> dict | None:
        return next((item for item in self.coordinator.data.get("devices", []) if item["id"] == self._device_id), None)

    @property
    def name(self) -> str | None:
        device = self._device()
        return f"{device.get('name') or device.get('imei')} location" if device else None

    @property
    def latitude(self):
        device = self._device()
        return (device.get("latest_position") or {}).get("latitude") if device else None

    @property
    def longitude(self):
        device = self._device()
        return (device.get("latest_position") or {}).get("longitude") if device else None

    @property
    def source_type(self):
        return "gps"

    @property
    def location_accuracy(self):
        return 50

    @property
    def extra_state_attributes(self):
        device = self._device()
        if not device:
            return None
        position = device.get("latest_position") or {}
        return {
            "status": device.get("status"),
            "protocol": device.get("protocol"),
            "timestamp": position.get("timestamp"),
            "speed": position.get("speed"),
        }

    @property
    def device_info(self):
        device = self._device()
        return {
            "identifiers": {(DOMAIN, self._device_id)},
            "name": device.get("name") or device.get("imei"),
            "manufacturer": "Movara",
            "model": device.get("protocol") or "Tracker",
        } if device else None
