"""Coach.AI backend application entrypoint."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .api.coach import router as coach_router
from .api.methodology import router as methodology_router
from .api.v1.router import router as v1_router
from .api.webhooks import router as webhooks_router
from .core.logging import configure_logging, new_request_id, request_id_var
from .core.rate_limit import RateLimiter

configure_logging(os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


async def _maybe_await(value: Any) -> Any:
    if hasattr(value, "__await__"):
        return await value
    return value


def _create_redis_client() -> Any | None:
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return None

    try:
        from redis.asyncio import Redis
    except ModuleNotFoundError:
        logger.warning("redis_client_unavailable", extra={"reason": "redis package is not installed"})
        return None

    return Redis.from_url(redis_url, decode_responses=True)


app = FastAPI(title="Coach.AI API")
app.include_router(v1_router)
app.include_router(methodology_router)
app.include_router(webhooks_router)
app.include_router(coach_router)

app.state.redis_client = _create_redis_client()
app.state.rate_limiter = RateLimiter(
    app.state.redis_client,
    limit=int(os.getenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "120")),
    window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")),
)


@app.middleware("http")
async def request_observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or new_request_id()
    token = request_id_var.set(request_id)
    started = time.perf_counter()
    client_host = request.client.host if request.client else None
    route_key = f"{request.method} {request.url.path}"

    rate_limit_result = None
    try:
        if request.url.path not in {"/health", "/docs", "/redoc", "/openapi.json"}:
            limiter: RateLimiter = getattr(request.app.state, "rate_limiter")
            identifier = client_host or request.headers.get("x-forwarded-for", "unknown").split(",")[0].strip() or "unknown"
            rate_limit_result = await limiter.check(identifier, bucket=route_key)
            if not rate_limit_result.allowed:
                duration_ms = round((time.perf_counter() - started) * 1000, 2)
                logger.warning(
                    "request_rate_limited",
                    extra={
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "client_ip": identifier,
                        "status_code": 429,
                        "duration_ms": duration_ms,
                        "rate_limit": rate_limit_result.limit,
                        "rate_limit_remaining": rate_limit_result.remaining,
                        "rate_limit_reset_seconds": rate_limit_result.reset_after_seconds,
                    },
                )
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded"},
                    headers={
                        "Retry-After": str(rate_limit_result.reset_after_seconds),
                        "X-Request-ID": request_id,
                        "X-RateLimit-Limit": str(rate_limit_result.limit),
                        "X-RateLimit-Remaining": str(rate_limit_result.remaining),
                        "X-RateLimit-Reset": str(rate_limit_result.reset_after_seconds),
                    },
                )

        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers.setdefault("X-Request-ID", request_id)
        if rate_limit_result is not None:
            response.headers.setdefault("X-RateLimit-Limit", str(rate_limit_result.limit))
            response.headers.setdefault("X-RateLimit-Remaining", str(rate_limit_result.remaining))
            response.headers.setdefault("X-RateLimit-Reset", str(rate_limit_result.reset_after_seconds))
        logger.info(
            "http_request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "client_ip": client_host,
                "user_agent": request.headers.get("user-agent"),
            },
        )
        return response
    except Exception:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.exception(
            "http_request_failed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": duration_ms,
                "client_ip": client_host,
            },
        )
        raise
    finally:
        request_id_var.reset(token)


@app.on_event("shutdown")
async def shutdown_event() -> None:
    redis_client = getattr(app.state, "redis_client", None)
    if redis_client is None:
        return
    close = getattr(redis_client, "aclose", None) or getattr(redis_client, "close", None)
    if close is not None:
        result = close()
        if hasattr(result, "__await__"):
            await result
