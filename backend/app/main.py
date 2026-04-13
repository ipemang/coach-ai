"""Coach.AI backend application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from .api.methodology import router as methodology_router
from .api.webhooks import router as webhooks_router


app = FastAPI(title="Coach.AI API")
app.include_router(methodology_router)
app.include_router(webhooks_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
