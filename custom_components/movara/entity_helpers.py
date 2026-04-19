from __future__ import annotations

from typing import Any

from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


def device_name(device: dict[str, Any] | None) -> str:
    if not device:
        return "Tracker"
    return device.get("name") or device.get("imei") or "Tracker"


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


def first_attribute(device: dict[str, Any] | None, *keys: str) -> Any:
    attrs = merged_attributes(device)
    for key in keys:
        if key in attrs:
            return attrs.get(key)
    return None


def protocol_label(device: dict[str, Any] | None) -> str:
    protocol = (device or {}).get("protocol")
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
