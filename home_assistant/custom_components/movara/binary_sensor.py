from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_helpers import (
    GPS_PACKET_IDS,
    MovaraCoordinatorEntity,
    has_any_attribute,
    latest_packet_attributes,
    latest_packet_attributes_with_keys,
    merged_attributes,
)
from .platform_setup import async_add_coordinator_entities


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entry.async_on_unload(
        async_add_coordinator_entities(
            coordinator,
            async_add_entities,
            lambda device: build_binary_sensor_entities(coordinator, device),
        )
    )


def build_binary_sensor_entities(coordinator, device: dict) -> list[BinarySensorEntity]:
    device_id = device["id"]
    entities: list[BinarySensorEntity] = [MovaraOnlineBinarySensor(coordinator, device_id)]
    latest_position = device.get("latest_position") or {}

    if has_any_attribute(device, "ignition", "gt06_status_acc_on"):
        entities.append(MovaraIgnitionBinarySensor(coordinator, device_id))

    if latest_packet_attributes(device, *GPS_PACKET_IDS) or latest_packet_attributes_with_keys(device, "ignition"):
        entities.append(MovaraGpsIgnitionBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "gps_fix"):
        entities.append(MovaraGpsFixBinarySensor(coordinator, device_id))

    if isinstance(latest_position.get("speed"), (int, float)) or has_any_attribute(device, "is_moving"):
        entities.append(MovaraMovingBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "ignition", "gt06_status_acc_on", "is_moving") or isinstance(latest_position.get("speed"), (int, float)):
        entities.append(MovaraTripActiveBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "charging"):
        entities.append(MovaraChargingBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "relay_triggered"):
        entities.append(MovaraRelayBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "motion_warning_enabled", "gt06_sensor_alarm_enabled"):
        entities.append(MovaraMotionMonitoringBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "device_active"):
        entities.append(MovaraDeviceActiveBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "defense_armed", "gt06_status_defense_armed"):
        entities.append(MovaraDefenseArmedBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "gt06_power_alarm_enabled"):
        entities.append(MovaraGt06PowerAlarmBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "gt06_low_battery_alarm_enabled"):
        entities.append(MovaraGt06LowBatteryAlarmBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "gt06_speed_alarm_enabled"):
        entities.append(MovaraGt06SpeedAlarmBinarySensor(coordinator, device_id))

    if has_any_attribute(device, "gt06_status_gps_enabled"):
        entities.append(MovaraGt06StatusGpsBinarySensor(coordinator, device_id))

    return entities


class MovaraOnlineBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Online"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_online"

    @property
    def is_on(self) -> bool:
        device = self._device()
        return bool(device and device.get("status") == "online")


class MovaraIgnitionBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Ignition"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_ignition"
        self._attr_icon = "mdi:car-electric"

    @property
    def is_on(self) -> bool | None:
        attrs = merged_attributes(self._device())
        value = attrs.get("ignition")
        if isinstance(value, bool):
            return value
        status_acc = attrs.get("gt06_status_acc_on")
        return status_acc if isinstance(status_acc, bool) else None


class MovaraGpsIgnitionBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "GPS ignition"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_gps_ignition"
        self._attr_icon = "mdi:crosshairs-gps"

    @property
    def is_on(self) -> bool | None:
        attrs = latest_packet_attributes(self._device(), *GPS_PACKET_IDS)
        if not attrs:
            attrs = latest_packet_attributes_with_keys(self._device(), "ignition")
        value = attrs.get("ignition")
        return value if isinstance(value, bool) else None


class MovaraGpsFixBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "GPS fix"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_gps_fix"
        self._attr_icon = "mdi:map-marker-radius"

    @property
    def is_on(self) -> bool | None:
        attrs = merged_attributes(self._device())
        value = attrs.get("gps_fix")
        return value if isinstance(value, bool) else None


class MovaraMovingBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Moving"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_moving"
        self._attr_icon = "mdi:motion-sensor"

    @property
    def is_on(self) -> bool | None:
        device = self._device()
        if not device:
            return None
        latest_position = device.get("latest_position") or {}
        speed = latest_position.get("speed")
        if isinstance(speed, (int, float)):
            return speed > 3
        attrs = merged_attributes(device)
        is_moving = attrs.get("is_moving")
        return is_moving if isinstance(is_moving, bool) else None


class MovaraTripActiveBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Trip active"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_trip_active"
        self._attr_icon = "mdi:map-marker-path"

    @property
    def is_on(self) -> bool | None:
        ignition = MovaraIgnitionBinarySensor.is_on.fget(self)  # type: ignore[attr-defined]
        moving = MovaraMovingBinarySensor.is_on.fget(self)  # type: ignore[attr-defined]
        if ignition is None and moving is None:
            return None
        return bool(ignition or moving)


class MovaraChargingBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Charging"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_charging"
        self._attr_icon = "mdi:battery-charging"

    @property
    def is_on(self) -> bool | None:
        attrs = merged_attributes(self._device())
        value = attrs.get("charging")
        return value if isinstance(value, bool) else None


class MovaraRelayBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Relay triggered"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_relay_triggered"
        self._attr_icon = "mdi:power-plug-off"

    @property
    def is_on(self) -> bool | None:
        attrs = merged_attributes(self._device())
        value = attrs.get("relay_triggered")
        return value if isinstance(value, bool) else None


class MovaraMotionMonitoringBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Motion monitoring"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_motion_monitoring"
        self._attr_icon = "mdi:vibrate"

    @property
    def is_on(self) -> bool | None:
        attrs = merged_attributes(self._device())
        value = attrs.get("motion_warning_enabled")
        if isinstance(value, bool):
            return value
        gt06_value = attrs.get("gt06_sensor_alarm_enabled")
        return gt06_value if isinstance(gt06_value, bool) else None


class MovaraDeviceActiveBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Device active"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_device_active"
        self._attr_icon = "mdi:power"

    @property
    def is_on(self) -> bool | None:
        attrs = merged_attributes(self._device())
        value = attrs.get("device_active")
        return value if isinstance(value, bool) else None


class MovaraDefenseArmedBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Defense armed"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_defense_armed"
        self._attr_icon = "mdi:shield-lock"

    @property
    def is_on(self) -> bool | None:
        attrs = merged_attributes(self._device())
        value = attrs.get("defense_armed")
        if isinstance(value, bool):
            return value
        status_value = attrs.get("gt06_status_defense_armed")
        return status_value if isinstance(status_value, bool) else None


class MovaraGt06PowerAlarmBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Power alarm"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_power_alarm"
        self._attr_icon = "mdi:power-plug-alert"

    @property
    def is_on(self) -> bool | None:
        value = merged_attributes(self._device()).get("gt06_power_alarm_enabled")
        return value if isinstance(value, bool) else None


class MovaraGt06LowBatteryAlarmBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Low battery alarm"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_low_battery_alarm"
        self._attr_icon = "mdi:battery-alert"

    @property
    def is_on(self) -> bool | None:
        value = merged_attributes(self._device()).get("gt06_low_battery_alarm_enabled")
        return value if isinstance(value, bool) else None


class MovaraGt06SpeedAlarmBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Speed alarm"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_speed_alarm"
        self._attr_icon = "mdi:speedometer-slow"

    @property
    def is_on(self) -> bool | None:
        value = merged_attributes(self._device()).get("gt06_speed_alarm_enabled")
        return value if isinstance(value, bool) else None


class MovaraGt06StatusGpsBinarySensor(MovaraCoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "GPS module"
        self._attr_unique_id = f"movara_{self._hub_key}_{self._device_id}_gt06_status_gps"
        self._attr_icon = "mdi:satellite-uplink"

    @property
    def is_on(self) -> bool | None:
        value = merged_attributes(self._device()).get("gt06_status_gps_enabled")
        return value if isinstance(value, bool) else None
