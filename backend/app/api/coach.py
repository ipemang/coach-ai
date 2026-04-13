"""Coach triage and verification API routes."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..services.coach_workflow import CoachWorkflow
from ..services.scope import DataScope
from ..services.whatsapp_service import WhatsAppService

router = APIRouter(prefix="/api/v1/coach", tags=["coach"])


class CoachTriageResponseItem(BaseModel):
    athlete_id: str
    athlete_name: str | None = None
    urgency_score: float
    urgency_label: str
    latest_memory_state_id: str | None = None
    latest_memory_state_at: str | None = None
    hrv_flag: str | None = None
    soreness_score: float | None = None
    missed_workouts: int = 0
    reasons: list[str] = Field(default_factory=list)
    memory_state: dict[str, Any] = Field(default_factory=dict)


class CoachVerifyRequest(BaseModel):
    organization_id: str = Field(..., min_length=1)
    coach_id: str = Field(..., min_length=1)
    suggestion_id: str = Field(..., description="Suggestion row id")
    decision: Literal["Approve", "Edit", "Ignore"]
    coach_notes: str | None = None
    edited_adjustment: dict[str, Any] | str | None = None
    send_confirmation: bool = True


class CoachVerifyResponse(BaseModel):
    suggestion_id: str
    decision: Literal["Approve", "Edit", "Ignore"]
    status: str
    athlete_id: str | None = None
    athlete_name: str | None = None
    confirmation_sent: bool = False
    confirmation_message_id: str | None = None
    confirmation_error: str | None = None
    suggestion: dict[str, Any] = Field(default_factory=dict)


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


async def _resolve_whatsapp_service(request: Request) -> WhatsAppService | None:
    scope = getattr(request.app.state, "scope", None)
    service = getattr(request.app.state, "whatsapp_service", None)
    if service is not None and hasattr(service, "send_text_message"):
        if getattr(service, "scope", None) is None and scope is not None:
            service.scope = scope
        return service

    whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
    if whatsapp_client is None:
        return None

    supabase_client = getattr(request.app.state, "supabase_client", None)
    return WhatsAppService(whatsapp_client=whatsapp_client, supabase_client=supabase_client, scope=scope)


@router.get("/triage", response_model=list[CoachTriageResponseItem])
async def coach_triage(
    request: Request,
    organization_id: str | None = None,
    coach_id: str | None = None,
) -> list[CoachTriageResponseItem]:
    supabase_client = await _resolve_supabase_client(request)
    scope = getattr(request.app.state, "scope", None)
    if organization_id or coach_id:
        scope = DataScope(organization_id=organization_id, coach_id=coach_id)
    workflow_kwargs = {
        "supabase_client": supabase_client,
        "whatsapp_service": await _resolve_whatsapp_service(request),
    }
    if scope is not None and scope.is_configured():
        workflow_kwargs["scope"] = scope
    workflow = CoachWorkflow(**workflow_kwargs)
    items = await workflow.build_triage()
    return [CoachTriageResponseItem.model_validate(asdict(item)) for item in items]


@router.post("/verify", response_model=CoachVerifyResponse)
async def coach_verify(request: Request, payload: CoachVerifyRequest) -> CoachVerifyResponse:
    supabase_client = await _resolve_supabase_client(request)
    workflow = CoachWorkflow(
        supabase_client=supabase_client,
        whatsapp_service=await _resolve_whatsapp_service(request),
        scope=DataScope(organization_id=payload.organization_id, coach_id=payload.coach_id),
    )

    try:
        result = await workflow.verify_suggestion(
            payload.suggestion_id,
            payload.decision,
            coach_notes=payload.coach_notes,
            edited_adjustment=payload.edited_adjustment,
            send_confirmation=payload.send_confirmation,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - downstream failures
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return CoachVerifyResponse.model_validate(asdict(result))
