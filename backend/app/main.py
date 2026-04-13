"""Coach.AI backend application entrypoint."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from uuid import uuid4
from typing import Any, AsyncIterator
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.responses import JSONResponse
from supabase import create_client

from .api.coach import router as coach_router
from .api.methodology import router as methodology_router
from .api.v1.router import router as v1_router
from .api.webhooks import router as webhooks_router
from .services import DataScope, get_settings
from .services.whatsapp_service import WhatsAppService


class WhatsAppGraphClient:
    def __init__(
        self,
        access_token: str | None,
        phone_number_id: str | None,
        graph_api_version: str = "v19.0",
    ) -> None:
        self.access_token = access_token
        self.phone_number_id = phone_number_id
        self.graph_api_version = graph_api_version

    async def send_message(self, to: str, body: str, **kwargs: Any) -> dict[str, Any]:
        if not self.access_token or not self.phone_number_id:
            raise RuntimeError("WhatsApp client is not configured")

        url = f"https://graph.facebook.com/{self.graph_api_version}/{self.phone_number_id}/messages"
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": body},
        }
        payload.update(kwargs)
        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except HTTPError as exc:
            detail = "WhatsApp send failed"
            if exc.fp is not None:
                try:
                    error_payload = json.loads(exc.read().decode("utf-8"))
                    if isinstance(error_payload, dict):
                        error = error_payload.get("error")
                        if isinstance(error, dict):
                            detail = str(error.get("message") or error.get("error_user_msg") or detail)
                        else:
                            detail = str(error_payload.get("message") or error_payload.get("error") or detail)
                except Exception:
                    pass
            raise RuntimeError(detail) from exc
        except (URLError, TimeoutError) as exc:
            raise RuntimeError("WhatsApp send failed") from exc


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    scope = DataScope(organization_id=settings.organization_id, coach_id=settings.coach_id)
    app.state.scope = scope
    app.state.organization_id = settings.organization_id
    app.state.coach_id = settings.coach_id

    supabase_client = None
    if settings.supabase_url and settings.supabase_service_role_key:
        supabase_client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    app.state.supabase_client = supabase_client

    whatsapp_client = WhatsAppGraphClient(
        settings.whatsapp_access_token,
        settings.whatsapp_phone_number_id,
        graph_api_version=settings.whatsapp_graph_api_version,
    )
    app.state.whatsapp_client = whatsapp_client
    app.state.whatsapp_service = WhatsAppService(
        whatsapp_client=whatsapp_client,
        supabase_client=supabase_client,
    )
    app.state.whatsapp_service.scope = scope

    yield


app = FastAPI(title="Coach.AI API", lifespan=lifespan)


@app.middleware("http")
async def request_context_and_rate_limit(request: FastAPIRequest, call_next):
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


app.include_router(v1_router)
app.include_router(methodology_router)
app.include_router(webhooks_router)
app.include_router(coach_router)
