"""Coach.AI backend application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from .services import get_settings
from .services.whatsapp_client import WhatsAppGraphClient

from .api.coach import router as coach_router
from .api.methodology import router as methodology_router
from .api.v1.router import router as v1_router
from .api.webhooks import router as webhooks_router


app = FastAPI(title="Coach.AI API")

try:
    settings = get_settings()
    app.state.whatsapp_client = WhatsAppGraphClient(
        settings.whatsapp_access_token,
        settings.whatsapp_phone_number_id,
        graph_api_version=settings.whatsapp_graph_api_version,
    )
except Exception:
    pass
app.include_router(v1_router)
app.include_router(methodology_router)
app.include_router(webhooks_router)
app.include_router(coach_router)
