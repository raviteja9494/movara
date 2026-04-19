from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import MovaraApiClient
from .const import DOMAIN

LOGGER = logging.getLogger(__name__)


class MovaraDataUpdateCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    def __init__(self, hass: HomeAssistant, api: MovaraApiClient, scan_interval: int, entry_id: str, hub_key: str) -> None:
        super().__init__(
            hass,
            LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self.api = api
        self.entry_id = entry_id
        self.hub_key = hub_key
        self.command_text_by_device: dict[str, str] = {}

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            return await self.api.async_fetch_snapshot()
        except RuntimeError as err:
            raise UpdateFailed(str(err)) from err

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
        await self.api.async_send_custom_command(device_id, device.get("protocol", "unknown"), command_text)
        await self.async_request_refresh()
