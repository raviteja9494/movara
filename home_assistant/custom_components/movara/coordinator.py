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
    def __init__(self, hass: HomeAssistant, api: MovaraApiClient, scan_interval: int) -> None:
        super().__init__(
            hass,
            LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self.api = api

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            return await self.api.async_fetch_snapshot()
        except RuntimeError as err:
            raise UpdateFailed(str(err)) from err
