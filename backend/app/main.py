"""Coach.AI backend application entrypoint."""

from __future__ import annotations

import asyncio

from fastapi import FastAPI

from .api.coach import router as coach_router
from .api.methodology import router as methodology_router
from .api.v1.router import router as v1_router
from .api.webhooks import router as webhooks_router
from .services.integrations import IntegrationService, IntegrationSyncWorker
from .services.scope import DataScope, resolve_scope_from_env


app = FastAPI(title="Coach.AI API")
app.state.scope = resolve_scope_from_env()
app.state.organization_id = app.state.scope.organization_id
app.state.coach_id = app.state.scope.coach_id
app.include_router(v1_router)
app.include_router(methodology_router)
app.include_router(webhooks_router)
app.include_router(coach_router)


@app.on_event("startup")
async def startup_integration_sync_worker() -> None:
    if not getattr(app.state, "integration_sync_enabled", False):
        return
    supabase_client = getattr(app.state, "supabase_client", None)
    if supabase_client is None:
        return
    scope = getattr(app.state, "scope", DataScope(organization_id=app.state.organization_id, coach_id=app.state.coach_id))
    biometrics_service = getattr(app.state, "biometrics_service", None)
    integration_service = getattr(
        app.state,
        "integration_service",
        IntegrationService(supabase_client=supabase_client, biometrics_service=biometrics_service, scope=scope),
    )
    app.state.integration_service = integration_service
    poll_interval = getattr(app.state, "integration_sync_poll_interval_seconds", 300)
    worker = IntegrationSyncWorker(integration_service=integration_service, poll_interval_seconds=poll_interval)
    app.state.integration_sync_worker = worker
    await worker.start()


@app.on_event("shutdown")
async def shutdown_integration_sync_worker() -> None:
    worker = getattr(app.state, "integration_sync_worker", None)
    if worker is not None:
        await worker.stop()
