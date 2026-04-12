from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import MovaraApiClient
from .const import CONF_BASE_URL, CONF_EMAIL, CONF_PASSWORD, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN


class MovaraConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            client = MovaraApiClient(
                async_get_clientsession(self.hass),
                user_input[CONF_BASE_URL],
                user_input[CONF_EMAIL],
                user_input[CONF_PASSWORD],
            )
            try:
                await client.async_test_credentials()
            except RuntimeError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(f"{user_input[CONF_BASE_URL].rstrip('/')}|{user_input[CONF_EMAIL].lower()}")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=f"Movara ({user_input[CONF_EMAIL]})", data=user_input)

        schema = vol.Schema({
            vol.Required(CONF_BASE_URL): str,
            vol.Required(CONF_EMAIL): str,
            vol.Required(CONF_PASSWORD): str,
            vol.Required(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): vol.All(vol.Coerce(int), vol.Range(min=10, max=300)),
        })
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
