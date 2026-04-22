from __future__ import annotations

from homeassistant.components.device_tracker.config_entry import TrackerEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_helpers import MovaraCoordinatorEntity
from .platform_setup import async_add_coordinator_entities


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entry.async_on_unload(
        async_add_coordinator_entities(
            coordinator,
            async_add_entities,
            lambda device: [MovaraDeviceTracker(coordinator, device["id"])] if has_coordinates(device) else [],
        )
    )


def has_coordinates(device: dict) -> bool:
    position = device.get("latest_position") or {}
    return isinstance(position.get("latitude"), (int, float)) and isinstance(position.get("longitude"), (int, float))


class MovaraDeviceTracker(MovaraCoordinatorEntity, TrackerEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_tracker"
        self._attr_name = "Location"

    @property
    def name(self) -> str | None:
        return None

    @property
    def latitude(self):
        device = self._device()
        return (device.get("latest_position") or {}).get("latitude") if device else None

    @property
    def longitude(self):
        device = self._device()
        return (device.get("latest_position") or {}).get("longitude") if device else None

    @property
    def available(self) -> bool:
        return super().available and has_coordinates(self._device() or {})

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
