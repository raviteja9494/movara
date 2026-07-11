from __future__ import annotations

from collections.abc import Callable
from typing import Any


def async_add_coordinator_entities(
    coordinator,
    async_add_entities,
    factory: Callable[[dict[str, Any]], list[Any]],
) -> Callable[[], None]:
    return async_add_coordinator_collection_entities(coordinator, async_add_entities, "devices", factory)


def async_add_coordinator_collection_entities(
    coordinator,
    async_add_entities,
    collection: str,
    factory: Callable[[dict[str, Any]], list[Any]],
) -> Callable[[], None]:
    seen: set[str] = set()

    def add_missing() -> None:
        new_entities: list[Any] = []
        for item in coordinator.data.get(collection, []):
            for entity in factory(item):
                unique_id = getattr(entity, "unique_id", None) or getattr(entity, "_attr_unique_id", None)
                if not isinstance(unique_id, str) or not unique_id:
                    continue
                if unique_id in seen:
                    continue
                seen.add(unique_id)
                new_entities.append(entity)
        if new_entities:
            async_add_entities(new_entities)

    add_missing()
    return coordinator.async_add_listener(add_missing)
