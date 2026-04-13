"""Coach.AI backend application entrypoint."""

from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .api.coach import router as coach_router
from .api.methodology import router as methodology_router
from .api.v1.router import router as v1_router
from .api.webhooks import router as webhooks_router
from .services.scope import resolve_scope_from_env


app = FastAPI(title="Coach.AI API")


@app.middleware("http")
async def request_context_and_rate_limit(request: Request, call_next):
    request_id = uuid4().hex
    request.state.request_id = request_id

    rate_limiter = getattr(request.app.state, "rate_limiter", None)
    if rate_limiter is not None and hasattr(rate_limiter, "check"):
        client = request.client.host if request.client and request.client.host else "anonymous"
        try:
            result = await rate_limiter.check(client, bucket=request.url.path)
        except Exception:
            result = None
        if result is not None and not result.allowed:
            response = JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
            response.headers["retry-after"] = str(result.reset_after_seconds)
            response.headers["x-request-id"] = request_id
            return response

    response = await call_next(request)
    response.headers.setdefault("x-request-id", request_id)
    return response

app.state.scope = resolve_scope_from_env()
app.state.organization_id = app.state.scope.organization_id
app.state.coach_id = app.state.scope.coach_id
app.include_router(v1_router)
app.include_router(methodology_router)
app.include_router(webhooks_router)
app.include_router(coach_router)
