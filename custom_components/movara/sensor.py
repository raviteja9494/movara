from __future__ import annotations

from datetime import datetime

from homeassistant.components.sensor import SensorEntity
from homeassistant.components.sensor.const import SensorDeviceClass, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_helpers import MovaraCoordinatorEntity, first_attribute, merged_attributes
from .platform_setup import async_add_coordinator_entities


NUMERIC_SENSOR_DEFINITIONS = [
    {
        "suffix": "satellites",
        "name": "Satellites",
        "keys": ("satellites",),
        "icon": "mdi:satellite-variant",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "altitude",
        "name": "Altitude",
        "keys": ("altitude",),
        "unit": "m",
        "icon": "mdi:image-filter-hdr",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "odometer",
        "name": "Device odometer",
        "keys": ("odometer", "gt06_mileage_raw"),
        "unit": "km",
        "icon": "mdi:counter",
        "state_class": SensorStateClass.TOTAL_INCREASING,
        "transform": lambda value, key: value / 1000 if key == "gt06_mileage_raw" else value,
    },
    {
        "suffix": "battery_voltage",
        "name": "Battery voltage",
        "keys": ("battery_voltage", "gt06_status_battery_voltage"),
        "unit": "V",
        "device_class": SensorDeviceClass.VOLTAGE,
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "control_module_voltage",
        "name": "Control module voltage",
        "keys": ("control_module_voltage",),
        "unit": "V",
        "device_class": SensorDeviceClass.VOLTAGE,
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "fuel_level",
        "name": "Fuel level",
        "keys": ("fuel_level",),
        "unit": "%",
        "icon": "mdi:gas-station",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "temperature",
        "name": "Temperature",
        "keys": ("temperature_c", "coolant_temp", "intake_air_temp", "engine_oil_temp"),
        "unit": "degC",
        "device_class": SensorDeviceClass.TEMPERATURE,
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "humidity",
        "name": "Humidity",
        "keys": ("humidity_percent",),
        "unit": "%",
        "device_class": SensorDeviceClass.HUMIDITY,
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "illuminance",
        "name": "Illuminance",
        "keys": ("illuminance_lux",),
        "unit": "lx",
        "device_class": SensorDeviceClass.ILLUMINANCE,
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "co2",
        "name": "CO2",
        "keys": ("co2_ppm",),
        "unit": "ppm",
        "icon": "mdi:molecule-co2",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "rpm",
        "name": "Engine RPM",
        "keys": ("rpm",),
        "unit": "rpm",
        "icon": "mdi:gauge",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "obd_speed",
        "name": "OBD speed",
        "keys": ("obd_speed",),
        "unit": "km/h",
        "icon": "mdi:speedometer",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "power_alarm_delay_seconds",
        "name": "Power alarm delay",
        "keys": ("gt06_power_alarm_delay_seconds",),
        "unit": "s",
        "icon": "mdi:timer-outline",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "power_alarm_charge_seconds",
        "name": "Power alarm charge delay",
        "keys": ("gt06_power_alarm_charge_seconds",),
        "unit": "s",
        "icon": "mdi:battery-clock-outline",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "speed_alarm_duration_seconds",
        "name": "Speed alarm duration",
        "keys": ("gt06_speed_alarm_duration_seconds",),
        "unit": "s",
        "icon": "mdi:av-timer",
        "state_class": SensorStateClass.MEASUREMENT,
    },
    {
        "suffix": "speed_alarm_threshold_kmh",
        "name": "Speed alarm threshold",
        "keys": ("gt06_speed_alarm_threshold_kmh",),
        "unit": "km/h",
        "icon": "mdi:speedometer-medium",
        "state_class": SensorStateClass.MEASUREMENT,
    },
]

TEXT_SENSOR_DEFINITIONS = [
    {
        "suffix": "packet_id",
        "name": "Last packet",
        "keys": ("tracking_packet_id",),
        "icon": "mdi:identifier",
        "entity_category": EntityCategory.DIAGNOSTIC,
    },
    {
        "suffix": "warning_type",
        "name": "Warning type",
        "keys": ("eelink_warning_type",),
        "icon": "mdi:alert-outline",
    },
    {
        "suffix": "report_type",
        "name": "Report type",
        "keys": ("eelink_report_type",),
        "icon": "mdi:file-document-outline",
    },
    {
        "suffix": "fence",
        "name": "Fence status",
        "keys": ("gt06_fence",),
        "icon": "mdi:fence",
    },
    {
        "suffix": "status_code",
        "name": "Tracker status code",
        "keys": ("gt06_status_code",),
        "icon": "mdi:information-outline",
    },
    {
        "suffix": "firmware_version",
        "name": "Firmware version",
        "keys": ("gt06_firmware_version",),
        "icon": "mdi:chip",
        "entity_category": EntityCategory.DIAGNOSTIC,
    },
    {
        "suffix": "timezone",
        "name": "Timezone",
        "keys": ("gt06_timezone",),
        "icon": "mdi:clock-time-four-outline",
    },
    {
        "suffix": "center_number",
        "name": "Center number",
        "keys": ("gt06_center_number",),
        "icon": "mdi:phone-cog-outline",
    },
    {
        "suffix": "battery_state",
        "name": "Battery state",
        "keys": ("gt06_status_battery_state",),
        "icon": "mdi:battery-heart-variant",
    },
    {
        "suffix": "gprs_link",
        "name": "GPRS link",
        "keys": ("gt06_status_gprs",),
        "icon": "mdi:wan",
    },
    {
        "suffix": "gprs2_link",
        "name": "GPRS2 link",
        "keys": ("gt06_status_gprs2",),
        "icon": "mdi:wan",
    },
    {
        "suffix": "gsm_signal_text",
        "name": "Signal quality",
        "keys": ("gt06_status_gsm_signal",),
        "icon": "mdi:signal-cellular-3",
    },
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entry.async_on_unload(
        async_add_coordinator_entities(
            coordinator,
            async_add_entities,
            lambda device_id: [
                MovaraLastSeenSensor(coordinator, device_id),
                MovaraSpeedSensor(coordinator, device_id),
                MovaraBatterySensor(coordinator, device_id),
                MovaraSignalSensor(coordinator, device_id),
                MovaraCommandStatusSensor(coordinator, device_id),
                MovaraCommandResponseSensor(coordinator, device_id),
                *[MovaraAttributeSensor(coordinator, device_id, definition) for definition in NUMERIC_SENSOR_DEFINITIONS],
                *[MovaraTextAttributeSensor(coordinator, device_id, definition) for definition in TEXT_SENSOR_DEFINITIONS],
            ],
        )
    )


class MovaraBaseSensor(MovaraCoordinatorEntity, SensorEntity):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)


class MovaraSpeedSensor(MovaraBaseSensor):
    _attr_native_unit_of_measurement = "km/h"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Speed"
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_speed"

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
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_last_seen"

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
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_battery"
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
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_signal"
        self._attr_icon = "mdi:signal"

    @property
    def native_value(self):
        attrs = merged_attributes(self._device())
        for key in ("gsm_signal_percent", "eelink_gsm_signal_level", "gsm_signal_dbm"):
            value = attrs.get(key)
            if isinstance(value, (int, float)):
                if key == "gsm_signal_percent" and value <= 1:
                    return round(value * 100, 1)
                if key == "gsm_signal_dbm":
                    return max(0, min(100, round((value + 110) * 2)))
                return round(value, 1)
        status_signal = attrs.get("gt06_status_gsm_signal")
        if isinstance(status_signal, str):
            normalized = status_signal.strip().lower()
            mapping = {
                "strong": 100,
                "good": 75,
                "medium": 50,
                "weak": 25,
                "poor": 10,
            }
            mapped = mapping.get(normalized)
            if mapped is not None:
                return mapped
        return None


class MovaraCommandStatusSensor(MovaraBaseSensor):
    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator, device_id)
        self._attr_name = "Command status"
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_command_status"
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
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_command_response"
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


class MovaraAttributeSensor(MovaraBaseSensor):
    def __init__(self, coordinator, device_id: str, definition: dict) -> None:
        super().__init__(coordinator, device_id)
        self._definition = definition
        self._attr_name = definition["name"]
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_{definition['suffix']}"
        if definition.get("unit"):
            self._attr_native_unit_of_measurement = definition["unit"]
        if definition.get("device_class"):
            self._attr_device_class = definition["device_class"]
        if definition.get("state_class"):
            self._attr_state_class = definition["state_class"]
        if definition.get("icon"):
            self._attr_icon = definition["icon"]

    @property
    def native_value(self):
        device = self._device()
        value = first_attribute(device, *self._definition["keys"])
        if value is None:
            return None
        if not isinstance(value, (int, float)):
            return None
        matched_key = None
        attrs = merged_attributes(device)
        for key in self._definition["keys"]:
            if key in attrs:
                matched_key = key
                break
        transform = self._definition.get("transform")
        if callable(transform):
            value = transform(value, matched_key)
        return round(value, 3) if isinstance(value, float) else value


class MovaraTextAttributeSensor(MovaraBaseSensor):
    def __init__(self, coordinator, device_id: str, definition: dict) -> None:
        super().__init__(coordinator, device_id)
        self._definition = definition
        self._attr_name = definition["name"]
        self._attr_unique_id = f"movara_{self._hub_key}_{device_id}_{definition['suffix']}"
        if definition.get("icon"):
            self._attr_icon = definition["icon"]
        if definition.get("entity_category"):
            self._attr_entity_category = definition["entity_category"]

    @property
    def native_value(self):
        value = first_attribute(self._device(), *self._definition["keys"])
        if value is None:
            return None
        return str(value)
