from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.services.biometrics import BiometricsService, Provider
from app.services.integrations import IntegrationConnectionResult, IntegrationService, IntegrationSyncWorker
from app.services.scope import DataScope

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])
WebhookRouter = APIRouter(prefix="/api/v1/integrations/webhooks", tags=["integrations-webhooks"])
ProviderName = Literal["garmin", "strava", "oura"]


class IntegrationStatusResponse(BaseModel):
    provider: ProviderName
    athlete_id: str
    connected: bool
    status: str | None = None
    provider_user_id: str | None = None
    scopes: list[str] = Field(default_factory=list)
    first_connected_at: str | None = None
    last_synced_at: str | None = None
    last_backfill_at: str | None = None
    expires_at: str | None = None
    backfill_days: int = 90
    connection_error: str | None = None


class IntegrationBackfillRequest(BaseModel):
    athlete_id: str = Field(..., min_length=1)
    provider: ProviderName
    days: int = Field(default=90, ge=1, le=365)


class IntegrationBackfillResponse(BaseModel):
    provider: ProviderName
    athlete_id: str
    backfill_days: int
    synced_days: list[str] = Field(default_factory=list)


class IntegrationWebhookResponse(BaseModel):
    status: str
    provider: ProviderName
    athlete_id: str | None = None
    synced_days: list[str] = Field(default_factory=list)
    reason: str | None = None


class IntegrationCallbackResponse(BaseModel):
    provider: ProviderName
    athlete_id: str
    first_connection: bool
    backfill_started: bool
    backfill_days: int
    provider_user_id: str | None = None
    scopes: list[str] = Field(default_factory=list)
    connected: bool = True


async def _resolve_supabase_client(request: Request) -> Any:
    supabase_client = getattr(request.app.state, "supabase_client", None)
    if supabase_client is not None:
        return supabase_client

    whatsapp_service = getattr(request.app.state, "whatsapp_service", None)
    if whatsapp_service is not None:
        candidate = getattr(whatsapp_service, "supabase_client", None)
        if candidate is not None:
            return candidate

    raise HTTPException(status_code=503, detail="Supabase client is not configured")


async def _resolve_biometrics_service(request: Request) -> BiometricsService | None:
    biometrics_service = getattr(request.app.state, "biometrics_service", None)
    if biometrics_service is not None:
        return biometrics_service

    try:
        supabase_client = await _resolve_supabase_client(request)
    except HTTPException:
        return None

    scope = getattr(request.app.state, "scope", None)
    if scope is None:
        scope = DataScope(
            organization_id=getattr(request.app.state, "organization_id", None),
            coach_id=getattr(request.app.state, "coach_id", None),
        )
    biometrics_service = BiometricsService(supabase_client=supabase_client, scope=scope)
    request.app.state.biometrics_service = biometrics_service
    return biometrics_service


async def _resolve_integration_service(request: Request) -> IntegrationService:
    integration_service = getattr(request.app.state, "integration_service", None)
    if integration_service is not None:
        return integration_service

    supabase_client = await _resolve_supabase_client(request)
    biometrics_service = await _resolve_biometrics_service(request)
    scope = getattr(request.app.state, "scope", None)
    if scope is None:
        scope = DataScope(
            organization_id=getattr(request.app.state, "organization_id", None),
            coach_id=getattr(request.app.state, "coach_id", None),
        )
    integration_service = IntegrationService(
        supabase_client=supabase_client,
        biometrics_service=biometrics_service,
        scope=scope,
    )
    request.app.state.integration_service = integration_service
    return integration_service


def _provider_name(provider: str) -> ProviderName:
    normalized = provider.strip().lower()
    if normalized not in {"garmin", "strava", "oura"}:
        raise HTTPException(status_code=404, detail=f"Unsupported provider: {provider}")
    return normalized  # type: ignore[return-value]


@router.get("/{provider}/connect")
async def connect_provider(
    request: Request,
    provider: str,
    athlete_id: str,
    organization_id: str | None = None,
    coach_id: str | None = None,
    redirect_uri: str | None = None,
) -> RedirectResponse:
    integration_service = await _resolve_integration_service(request)
    provider_name = _provider_name(provider)
    try:
        authorize_url, _, _ = integration_service.build_authorize_url(
            provider_name,
            athlete_id=athlete_id,
            organization_id=organization_id,
            coach_id=coach_id,
            redirect_uri=redirect_uri,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RedirectResponse(authorize_url, status_code=302)


@router.get("/{provider}/callback", response_model=IntegrationCallbackResponse)
async def callback_provider(
    request: Request,
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
) -> IntegrationCallbackResponse:
    if error:
        raise HTTPException(status_code=400, detail=error_description or error)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code or state")

    integration_service = await _resolve_integration_service(request)
    result: IntegrationConnectionResult
    try:
        result = await integration_service.connect_from_code(_provider_name(provider), code=code, state=state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return IntegrationCallbackResponse(
        provider=result.provider,
        athlete_id=result.athlete_id,
        first_connection=result.first_connection,
        backfill_started=result.backfill_started,
        backfill_days=result.backfill_days,
        provider_user_id=result.token.provider_user_id,
        scopes=list(result.token.scopes),
        connected=True,
    )


@router.get("/{provider}/status", response_model=IntegrationStatusResponse)
async def get_status(request: Request, provider: str, athlete_id: str) -> IntegrationStatusResponse:
    integration_service = await _resolve_integration_service(request)
    provider_name = _provider_name(provider)
    row = await integration_service.get_connection(provider_name, athlete_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No {provider_name} integration found for athlete {athlete_id}")

    return IntegrationStatusResponse(
        provider=provider_name,
        athlete_id=athlete_id,
        connected=True,
        status=row.get("status"),
        provider_user_id=row.get("provider_user_id"),
        scopes=_as_list(row.get("scopes")),
        first_connected_at=_maybe_str(row.get("first_connected_at")),
        last_synced_at=_maybe_str(row.get("last_synced_at")),
        last_backfill_at=_maybe_str(row.get("last_backfill_at")),
        expires_at=_maybe_str(row.get("expires_at")),
        backfill_days=int(row.get("backfill_days") or 90),
        connection_error=_maybe_str(row.get("connection_error")),
    )


@router.post("/{provider}/backfill", response_model=IntegrationBackfillResponse)
async def run_backfill(
    request: Request,
    provider: str,
    payload: IntegrationBackfillRequest,
) -> IntegrationBackfillResponse:
    provider_name = _provider_name(provider)
    if provider_name != payload.provider:
        raise HTTPException(status_code=400, detail="Provider mismatch")

    integration_service = await _resolve_integration_service(request)
    try:
        result = await integration_service.backfill_last_n_days(provider_name, payload.athlete_id, days=payload.days)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return IntegrationBackfillResponse(
        provider=provider_name,
        athlete_id=payload.athlete_id,
        backfill_days=payload.days,
        synced_days=result["synced_days"],
    )


@router.post("/{provider}/sync")
async def sync_single_provider(request: Request, provider: str) -> dict[str, Any]:
    integration_service = await _resolve_integration_service(request)
    provider_name = _provider_name(provider)
    result = await integration_service.sync_all_active_connections()
    return {"provider": provider_name, **result}


@WebhookRouter.post("/{provider}", response_model=IntegrationWebhookResponse)
async def provider_webhook(request: Request, provider: str) -> IntegrationWebhookResponse:
    provider_name = _provider_name(provider)
    integration_service = await _resolve_integration_service(request)
    payload = await _read_json(request)
    try:
        result = await integration_service.handle_webhook(provider_name, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    status = str(result.get("status") or "ignored")
    return IntegrationWebhookResponse(
        status=status,
        provider=provider_name,
        athlete_id=result.get("athlete_id"),
        synced_days=list(result.get("synced_days") or []),
        reason=result.get("reason"),
    )


@WebhookRouter.post("/sync")
async def background_sync_webhook(request: Request) -> dict[str, Any]:
    integration_service = await _resolve_integration_service(request)
    worker = IntegrationSyncWorker(
        integration_service=integration_service,
        poll_interval_seconds=getattr(request.app.state, "integration_sync_poll_interval_seconds", 300),
    )
    result = await worker.run_once()
    return {"status": "ok", **result}


async def _read_json(request: Request) -> dict[str, Any]:
    raw = await request.body()
    if not raw:
        return {}
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    return decoded if isinstance(decoded, dict) else {"data": decoded}


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.replace(",", " ").split() if item.strip()]
    return [str(value)]


def _maybe_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)


__all__ = ["router", "WebhookRouter"]
