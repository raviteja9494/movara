from __future__ import annotations

from typing import Any

from aiohttp import ClientError, ClientSession


class MovaraApiClient:
    def __init__(self, session: ClientSession, base_url: str, email: str, password: str) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._email = email
        self._password = password
        self._token: str | None = None

    @property
    def base_url(self) -> str:
        return self._base_url

    async def async_test_credentials(self) -> None:
        await self._ensure_token(force_refresh=True)
        await self.async_fetch_devices()

    async def async_fetch_snapshot(self) -> dict[str, Any]:
        devices = await self.async_fetch_devices()
        snapshot_devices: list[dict[str, Any]] = []
        for device in devices:
            position = await self.async_fetch_latest_position(device["id"])
            latest_command = await self.async_fetch_latest_command(device["id"])
            snapshot_devices.append({**device, "latest_position": position, "latest_command": latest_command})
        return {"devices": snapshot_devices}

    async def async_fetch_devices(self) -> list[dict[str, Any]]:
        response = await self._request("GET", "/api/v1/devices")
        return response.get("data", [])

    async def async_fetch_latest_position(self, device_id: str) -> dict[str, Any] | None:
        response = await self._request("GET", f"/api/v1/positions/latest?deviceId={device_id}&limit=1")
        positions = response.get("positions", [])
        return positions[0] if positions else None

    async def async_fetch_latest_command(self, device_id: str) -> dict[str, Any] | None:
        response = await self._request("GET", f"/api/v1/devices/{device_id}/commands")
        commands = response.get("commands", [])
        return commands[0] if commands else None

    async def async_send_custom_command(self, device_id: str, protocol: str, command_text: str) -> dict[str, Any]:
        command_key_by_protocol = {
            "eelink": "eelink_custom",
            "gt06": "gt06_custom",
        }
        command_key = command_key_by_protocol.get(protocol)
        if not command_key:
            raise RuntimeError(f"Protocol {protocol} does not support custom commands")
        return await self._request(
            "POST",
            f"/api/v1/devices/{device_id}/commands",
            {"commandKey": command_key, "values": {"content": command_text}},
        )

    async def _ensure_token(self, force_refresh: bool = False) -> str:
        if self._token and not force_refresh:
            return self._token
        payload = {"email": self._email, "password": self._password}
        try:
            async with self._session.post(f"{self._base_url}/api/v1/auth/login", json=payload) as response:
                response.raise_for_status()
                body = await response.json()
        except ClientError as err:
            raise RuntimeError("Unable to reach Movara") from err
        token = body.get("token")
        if not token:
            raise RuntimeError("Movara login did not return a token")
        self._token = token
        return token

    async def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        token = await self._ensure_token()
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{self._base_url}{path}"
        try:
            request_kwargs: dict[str, Any] = {"headers": headers}
            if payload is not None:
                request_kwargs["json"] = payload
            async with self._session.request(method, url, **request_kwargs) as response:
                if response.status == 401:
                    token = await self._ensure_token(force_refresh=True)
                    headers["Authorization"] = f"Bearer {token}"
                    retry_kwargs: dict[str, Any] = {"headers": headers}
                    if payload is not None:
                        retry_kwargs["json"] = payload
                    async with self._session.request(method, url, **retry_kwargs) as retry:
                        retry.raise_for_status()
                        return await retry.json()
                response.raise_for_status()
                return await response.json()
        except ClientError as err:
            raise RuntimeError("Movara request failed") from err
