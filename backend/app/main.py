from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(
    title="Coach.AI Backend",
    description="FastAPI backend for a B2B endurance coaching platform",
    version="0.1.0",
)

app.include_router(api_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Coach.AI backend is running"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
