from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

SENSOR_FIELDS = (
    ("protocol", "protocol"),
    ("last_seen", "last seen"),
    ("imei", "IMEI"),
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = []
    for device in coordinator.data.get("devices", []):
        for field, label in SENSOR_FIELDS:
            entities.append(MovaraSensor(coordinator, device["id"], field, label))
        entities.append(MovaraSpeedSensor(coordinator, device["id"]))
        entities.append(MovaraCommandStatusSensor(coordinator, device["id"]))
        entities.append(MovaraCommandResponseSensor(coordinator, device["id"]))
    async_add_entities(entities)


class MovaraBaseSensor(CoordinatorEntity, SensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator)
        self._device_id = device_id

    def _device(self) -> dict | None:
        return next((item for item in self.coordinator.data.get("devices", []) if item["id"] == self._device_id), None)

    @property
    def device_info(self):
        device = self._device()
        return {
            "identifiers": {(DOMAIN, self._device_id)},
            "name": device.get("name") or device.get("imei"),
            "manufacturer": "Movara",
            "model": device.get("protocol") or "Tracker",
        } if device else None


class MovaraSensor(MovaraBaseSensor):
    def __init__(self, coordinator, device_id: str, field: str, label: str) -> None:
        super().__init__(coordinator, device_id)
        self._field = field
        self._attr_name = f"Movara {label} {device_id[-6:]}"
        self._attr_unique_id = f"movara_{device_id}_{field}"

    @property
    def native_value(self):
        device = self._device()
        if not device:
            return None
        return device.get(self._field)


class MovaraSpeedSensor(MovaraBaseSensor):
    _attr_native_unit_of_measurement = "km/h"

    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = f"Movara speed {device_id[-6:]}"
        self._attr_unique_id = f"movara_{device_id}_speed"

    @property
    def native_value(self):
        device = self._device()
        if not device:
            return None
        position = device.get("latest_position") or {}
        return position.get("speed")


class MovaraCommandStatusSensor(MovaraBaseSensor):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = f"Movara command status {device_id[-6:]}"
        self._attr_unique_id = f"movara_{device_id}_command_status"

    @property
    def native_value(self):
        device = self._device()
        if not device:
            return None
        latest_command = device.get("latest_command") or {}
        return latest_command.get("status")

    @property
    def extra_state_attributes(self):
        device = self._device()
        if not device:
            return None
        latest_command = device.get("latest_command") or {}
        if not latest_command:
            return None
        return {
            "command_label": latest_command.get("commandLabel"),
            "command_content": latest_command.get("content"),
            "responded_at": latest_command.get("respondedAt"),
            "sent_at": latest_command.get("sentAt"),
        }


class MovaraCommandResponseSensor(MovaraBaseSensor):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = f"Movara command response {device_id[-6:]}"
        self._attr_unique_id = f"movara_{device_id}_command_response"

    @property
    def native_value(self):
        device = self._device()
        if not device:
            return None
        latest_command = device.get("latest_command") or {}
        return latest_command.get("response") or latest_command.get("error")

    @property
    def extra_state_attributes(self):
        device = self._device()
        if not device:
            return None
        latest_command = device.get("latest_command") or {}
        if not latest_command:
            return None
        return {
            "status": latest_command.get("status"),
            "command_label": latest_command.get("commandLabel"),
            "command_content": latest_command.get("content"),
        }
