"""Coach.AI backend application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from .api.methodology import router as methodology_router


app = FastAPI(title="Coach.AI API")
app.include_router(methodology_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
