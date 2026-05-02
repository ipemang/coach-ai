from __future__ import annotations

import inspect
import logging
import time
from dataclasses import dataclass
from typing import Any

from .cache import build_cache_key

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    reset_after_seconds: int
    current_count: int
    key: str


class RateLimiter:
    def __init__(
        self,
        client: Any | None = None,
        *,
        namespace: str = "coach-ai:rate-limit",
        limit: int = 120,
        window_seconds: int = 60,
    ) -> None:
        self.client = client
        self.namespace = namespace
        self.limit = limit
        self.window_seconds = window_seconds
        self._memory_store: dict[str, tuple[int, float]] = {}

    async def check(self, identifier: str, *, bucket: str) -> RateLimitResult:
        window_start = int(time.time() // self.window_seconds)
        key = build_cache_key(self.namespace, bucket, identifier, window_start)
        reset_after_seconds = self._reset_after_seconds()

        if self.client is None:
            current_count = self._memory_increment(key)
        else:
            current_count = await self._redis_increment(key)

        allowed = current_count <= self.limit
        remaining = max(self.limit - current_count, 0)
        return RateLimitResult(
            allowed=allowed,
            limit=self.limit,
            remaining=remaining,
            reset_after_seconds=reset_after_seconds,
            current_count=current_count,
            key=key,
        )

    def _memory_increment(self, key: str) -> int:
        now = time.time()
        current = self._memory_store.get(key)
        if current is None or current[1] <= now:
            self._memory_store[key] = (1, now + self.window_seconds)
            return 1
        count, expires_at = current
        count += 1
        self._memory_store[key] = (count, expires_at)
        return count

    async def _redis_increment(self, key: str) -> int:
        current_count = await _maybe_await(self.client.incr(key))
        if current_count == 1:
            if hasattr(self.client, "expire"):
                await _maybe_await(self.client.expire(key, self.window_seconds))
            elif hasattr(self.client, "setex"):
                # Best-effort fallback if the client requires an explicit TTL on creation.
                await _maybe_await(self.client.setex(key, self.window_seconds, current_count))
        return int(current_count)

    def _reset_after_seconds(self) -> int:
        elapsed = int(time.time() % self.window_seconds)
        return max(self.window_seconds - elapsed, 1)


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value
