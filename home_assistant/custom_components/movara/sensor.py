from __future__ import annotations

from datetime import datetime

from homeassistant.components.sensor import SensorEntity
from homeassistant.components.sensor.const import SensorDeviceClass, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_helpers import MovaraCoordinatorEntity, merged_attributes


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = []
    for device in coordinator.data.get("devices", []):
        entities.append(MovaraLastSeenSensor(coordinator, device["id"]))
        entities.append(MovaraSpeedSensor(coordinator, device["id"]))
        entities.append(MovaraBatterySensor(coordinator, device["id"]))
        entities.append(MovaraSignalSensor(coordinator, device["id"]))
        entities.append(MovaraCommandStatusSensor(coordinator, device["id"]))
        entities.append(MovaraCommandResponseSensor(coordinator, device["id"]))
    async_add_entities(entities)


class MovaraBaseSensor(MovaraCoordinatorEntity, SensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)


class MovaraSpeedSensor(MovaraBaseSensor):
    _attr_native_unit_of_measurement = "km/h"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Speed"
        self._attr_unique_id = f"movara_{device_id}_speed"

    @property
    def native_value(self):
        device = self._device()
        if not device:
            return None
        position = device.get("latest_position") or {}
        return position.get("speed")


class MovaraLastSeenSensor(MovaraBaseSensor):
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Last seen"
        self._attr_unique_id = f"movara_{device_id}_last_seen"

    @property
    def native_value(self):
        device = self._device()
        if not device or not device.get("lastSeen"):
            return None
        return datetime.fromisoformat(device["lastSeen"])


class MovaraBatterySensor(MovaraBaseSensor):
    _attr_native_unit_of_measurement = "%"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Battery"
        self._attr_unique_id = f"movara_{device_id}_battery"
        self._attr_device_class = SensorDeviceClass.BATTERY

    @property
    def native_value(self):
        attrs = merged_attributes(self._device())
        for key in ("battery_percent", "battery_level"):
            value = attrs.get(key)
            if isinstance(value, (int, float)):
                if key == "battery_level" and value <= 1:
                    return round(value * 100, 1)
                return round(value, 1)
        return None


class MovaraSignalSensor(MovaraBaseSensor):
    _attr_native_unit_of_measurement = "%"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Signal"
        self._attr_unique_id = f"movara_{device_id}_signal"
        self._attr_icon = "mdi:signal"

    @property
    def native_value(self):
        attrs = merged_attributes(self._device())
        for key in ("gsm_signal_percent", "eelink_gsm_signal_level", "gsm_signal_dbm"):
            value = attrs.get(key)
            if isinstance(value, (int, float)):
                if key == "gsm_signal_dbm":
                    return max(0, min(100, round((value + 110) * 2)))
                return round(value, 1)
        return None


class MovaraCommandStatusSensor(MovaraBaseSensor):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Command status"
        self._attr_unique_id = f"movara_{device_id}_command_status"
        self._attr_entity_category = EntityCategory.DIAGNOSTIC

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
        self._attr_name = "Command response"
        self._attr_unique_id = f"movara_{device_id}_command_response"
        self._attr_entity_category = EntityCategory.DIAGNOSTIC

    @property
    def native_value(self):
        device = self._device()
        if not device:
            return None
        latest_command = device.get("latest_command") or {}
        value = latest_command.get("response") or latest_command.get("error")
        if value is None:
            return None
        text = str(value)
        return text[:255]

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
            "full_response": latest_command.get("response") or latest_command.get("error"),
            "responded_at": latest_command.get("respondedAt"),
        }
