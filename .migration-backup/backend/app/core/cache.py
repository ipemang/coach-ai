from __future__ import annotations

import inspect
import json
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class RedisLikeClient(Protocol):
    async def get(self, key: str) -> Any:  # pragma: no cover - protocol
        ...

    async def set(self, key: str, value: Any, ex: int | None = None) -> Any:  # pragma: no cover - protocol
        ...

    async def setex(self, key: str, time: int, value: Any) -> Any:  # pragma: no cover - protocol
        ...

    async def delete(self, key: str) -> Any:  # pragma: no cover - protocol
        ...


class JsonCache:
    def __init__(self, client: Any | None, namespace: str, default_ttl_seconds: int = 300) -> None:
        self.client = client
        self.namespace = namespace.strip(":")
        self.default_ttl_seconds = default_ttl_seconds

    async def get(self, key: str) -> Any | None:
        if self.client is None:
            return None

        full_key = self._full_key(key)
        raw = await _maybe_await(self.client.get(full_key))
        if raw is None:
            return None

        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        if isinstance(raw, str):
            try:
                decoded = json.loads(raw)
            except json.JSONDecodeError:
                return None
        else:
            decoded = raw

        if not isinstance(decoded, dict) or "value" not in decoded:
            return decoded
        if decoded.get("is_none"):
            return None
        return decoded.get("value")

    async def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        if self.client is None:
            return

        payload = json.dumps(
            {"value": _json_safe(value), "is_none": value is None},
            default=_json_default,
            ensure_ascii=False,
        )
        full_key = self._full_key(key)
        resolved_ttl = ttl_seconds or self.default_ttl_seconds
        if hasattr(self.client, "setex"):
            await _maybe_await(self.client.setex(full_key, resolved_ttl, payload))
            return
        await _maybe_await(self.client.set(full_key, payload, ex=resolved_ttl))

    async def delete(self, key: str) -> None:
        if self.client is None:
            return
        await _maybe_await(self.client.delete(self._full_key(key)))

    def _full_key(self, key: str) -> str:
        return f"{self.namespace}:{key.lstrip(':')}"


def build_cache_key(*parts: Any) -> str:
    return ":".join(_stringify_part(part) for part in parts if part is not None)


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _json_safe(value: Any) -> Any:
    if is_dataclass(value):
        return _json_safe(asdict(value))
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, set):
        return sorted(_json_safe(item) for item in value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _json_default(value: Any) -> Any:
    return _json_safe(value)


def _stringify_part(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value).replace(":", "_")
