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
            "identifiers": {(DOMAIN, self._device_id)},
            "name": device_name(device),
            "manufacturer": "Movara",
            "model": protocol_label(device),
            "serial_number": device.get("imei"),
        }
