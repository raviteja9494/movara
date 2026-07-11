from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import MovaraApiClient
from .const import DEFAULT_ACTIVE_HOLD_SECONDS, DEFAULT_ACTIVE_SCAN_INTERVAL, DOMAIN
from .entity_helpers import device_supports_custom_commands, merged_attributes

LOGGER = logging.getLogger(__name__)


class MovaraDataUpdateCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    def __init__(
        self,
        hass: HomeAssistant,
        api: MovaraApiClient,
        scan_interval: int,
        active_scan_interval: int,
        active_hold_seconds: int,
        entry_id: str,
        hub_key: str,
    ) -> None:
        super().__init__(
            hass,
            LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self.api = api
        self.entry_id = entry_id
        self.hub_key = hub_key
        self.parked_scan_interval = max(10, scan_interval)
        self.active_scan_interval = max(3, active_scan_interval or DEFAULT_ACTIVE_SCAN_INTERVAL)
        self.active_hold_seconds = max(0, active_hold_seconds if active_hold_seconds is not None else DEFAULT_ACTIVE_HOLD_SECONDS)
        self._active_until: datetime | None = None
        self.command_text_by_device: dict[str, str] = {}

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            data = await self.api.async_fetch_snapshot()
        except RuntimeError as err:
            raise UpdateFailed(str(err)) from err
        self._update_dynamic_interval(data)
        return data

    def _update_dynamic_interval(self, data: dict[str, Any]) -> None:
        now = datetime.now()
        if self._has_active_ignition(data):
            self._active_until = now + timedelta(seconds=self.active_hold_seconds)

        should_poll_fast = self._active_until is not None and now <= self._active_until
        interval = self.active_scan_interval if should_poll_fast else self.parked_scan_interval
        self.update_interval = timedelta(seconds=interval)

    def _has_active_ignition(self, data: dict[str, Any]) -> bool:
        for device in data.get("devices", []):
            attrs = merged_attributes(device)
            ignition = attrs.get("ignition")
            if isinstance(ignition, bool):
                if ignition:
                    return True
                continue
            status_acc = attrs.get("gt06_status_acc_on")
            if isinstance(status_acc, bool) and status_acc:
                return True
        return False

    def get_command_text(self, device_id: str) -> str:
        return self.command_text_by_device.get(device_id, "")

    def set_command_text(self, device_id: str, value: str) -> None:
        self.command_text_by_device[device_id] = value

    async def async_send_stored_command(self, device_id: str) -> None:
        command_text = self.get_command_text(device_id).strip()
        if not command_text:
            raise ValueError("No custom command entered")
        device = next((item for item in self.data.get("devices", []) if item["id"] == device_id), None)
        if not device:
            raise ValueError(f"Movara device {device_id} not found")
        if not device_supports_custom_commands(device):
            raise ValueError(f"Movara device {device_id} does not support custom commands")
        await self.api.async_send_custom_command(device_id, device.get("protocol", "unknown"), command_text)
        await self.async_request_refresh()
