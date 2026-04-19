from __future__ import annotations

from collections.abc import Callable
from typing import Any


def async_add_coordinator_entities(
    coordinator,
    async_add_entities,
    factory: Callable[[str], list[Any]],
) -> Callable[[], None]:
    seen: set[str] = set()

    def add_missing() -> None:
        new_entities: list[Any] = []
        for device in coordinator.data.get("devices", []):
            device_id = device["id"]
            if device_id in seen:
                continue
            seen.add(device_id)
            new_entities.extend(factory(device_id))
        if new_entities:
            async_add_entities(new_entities)

    add_missing()
    return coordinator.async_add_listener(add_missing)
