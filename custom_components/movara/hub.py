from __future__ import annotations


def hub_namespace(value: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in value.lower()).strip("_") or "movara"
