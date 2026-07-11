from __future__ import annotations

from typing import Any

from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

CUSTOM_COMMAND_PROTOCOLS = {"eelink", "gt06"}
GT06_GPS_PACKET_IDS = ("0x10", "0x12", "0x22")
GPS_PACKET_IDS = (*GT06_GPS_PACKET_IDS, "gps", "location_compact", "location")


def device_name(device: dict[str, Any] | None) -> str:
    if not device:
        return "Tracker"
    return device.get("name") or device.get("imei") or "Tracker"


def vehicle_name(vehicle: dict[str, Any] | None) -> str:
    if not vehicle:
        return "Vehicle"
    return vehicle.get("name") or "Vehicle"


def merged_attributes(device: dict[str, Any] | None) -> dict[str, Any]:
    if not device:
        return {}
    merged: dict[str, Any] = {}
    last_attributes = device.get("lastAttributes")
    if isinstance(last_attributes, dict):
        merged.update(last_attributes)
    latest_position = device.get("latest_position") or {}
    position_attributes = latest_position.get("attributes")
    if isinstance(position_attributes, dict):
        merged.update(position_attributes)
    return merged


def latest_packet_attributes(device: dict[str, Any] | None, *packet_ids: str) -> dict[str, Any]:
    if not device:
        return {}
    snapshots = device.get("packetAttributes")
    if not isinstance(snapshots, list):
        return {}
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            continue
        if snapshot.get("packetId") not in packet_ids:
            continue
        attributes = snapshot.get("attributes")
        if isinstance(attributes, dict):
            return attributes
    return {}


def latest_packet_attributes_with_keys(device: dict[str, Any] | None, *keys: str) -> dict[str, Any]:
    if not device:
        return {}
    snapshots = device.get("packetAttributes")
    if not isinstance(snapshots, list):
        return {}
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            continue
        attributes = snapshot.get("attributes")
        if not isinstance(attributes, dict):
            continue
        if any(key in attributes for key in keys):
            return attributes
    return {}


def first_attribute(device: dict[str, Any] | None, *keys: str) -> Any:
    attrs = merged_attributes(device)
    for key in keys:
        if key in attrs:
            return attrs.get(key)
    return None


def device_protocol(device: dict[str, Any] | None) -> str:
    protocol = (device or {}).get("protocol")
    if isinstance(protocol, str) and protocol:
        return protocol
    attrs = merged_attributes(device)
    tracking_protocol = attrs.get("tracking_protocol")
    if isinstance(tracking_protocol, str) and tracking_protocol:
        return tracking_protocol
    return "unknown"


def device_supports_custom_commands(device: dict[str, Any] | None) -> bool:
    return device_protocol(device) in CUSTOM_COMMAND_PROTOCOLS


def has_any_attribute(device: dict[str, Any] | None, *keys: str) -> bool:
    attrs = merged_attributes(device)
    return any(key in attrs for key in keys)


def protocol_label(device: dict[str, Any] | None) -> str:
    protocol = device_protocol(device)
    if not protocol or protocol == "unknown":
        return "Tracker"
    return str(protocol).upper()


class MovaraCoordinatorEntity(CoordinatorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, device_id: str) -> None:
        super().__init__(coordinator)
        self._device_id = device_id
        self._hub_key = coordinator.hub_key

    def _device(self) -> dict[str, Any] | None:
        return next(
            (item for item in self.coordinator.data.get("devices", []) if item["id"] == self._device_id),
            None,
        )

    @property
    def device_info(self):
        device = self._device()
        if not device:
            return None
        return {
            "identifiers": {(DOMAIN, f"{self._hub_key}_{self._device_id}")},
            "name": device_name(device),
            "manufacturer": "Movara",
            "model": protocol_label(device),
            "serial_number": device.get("imei"),
            "configuration_url": self.coordinator.api.base_url,
        }


class MovaraVehicleCoordinatorEntity(CoordinatorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, vehicle_id: str) -> None:
        super().__init__(coordinator)
        self._vehicle_id = vehicle_id
        self._hub_key = coordinator.hub_key

    def _vehicle(self) -> dict[str, Any] | None:
        return next(
            (item for item in self.coordinator.data.get("vehicles", []) if item["id"] == self._vehicle_id),
            None,
        )

    @property
    def device_info(self):
        vehicle = self._vehicle()
        if not vehicle:
            return None
        return {
            "identifiers": {(DOMAIN, f"{self._hub_key}_vehicle_{self._vehicle_id}")},
            "name": vehicle_name(vehicle),
            "manufacturer": "Movara",
            "model": "Vehicle",
            "configuration_url": self.coordinator.api.base_url,
        }
