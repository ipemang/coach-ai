"""Coach.AI backend application entrypoint."""

from __future__ import annotations

import json
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI

from .services import get_settings

from .api.coach import router as coach_router
from .api.methodology import router as methodology_router
from .api.v1.router import router as v1_router
from .api.webhooks import router as webhooks_router


class WhatsAppGraphClient:
    def __init__(self, access_token: Optional[str], phone_number_id: Optional[str]) -> None:
        self.access_token = access_token
        self.phone_number_id = phone_number_id
        self.graph_api_version = "v19.0"

    async def send_message(self, to: str, body: str, **kwargs: Any) -> dict[str, Any]:
        if not self.access_token or not self.phone_number_id:
            raise RuntimeError("WhatsApp client is not configured")

        url = f"https://graph.facebook.com/{self.graph_api_version}/{self.phone_number_id}/messages"
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {
                "body": body,
                "preview_url": False,
            },
        }
        _ = kwargs
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


app = FastAPI(title="Coach.AI API")

try:
    settings = get_settings()
    whatsapp_client = WhatsAppGraphClient(
        settings.whatsapp_access_token,
        settings.whatsapp_phone_number_id
    )
    app.state.whatsapp_client = whatsapp_client
except Exception:
    pass
app.include_router(v1_router)
app.include_router(methodology_router)
app.include_router(webhooks_router)
app.include_router(coach_router)
