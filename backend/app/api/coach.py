"""Coach triage and verification API routes."""
from __future__ import annotations
from typing import Any, Literal, List
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from app.core.security import AuthenticatedPrincipal, require_roles, resolve_coach_scope
from app.services.coach_workflow import CoachWorkflow, CoachDecision
from app.services.whatsapp_service import WhatsAppService

router = APIRouter(prefix="/api/v1/coach", tags=["coach"])


class CoachTriageResponseItem(BaseModel):
    athlete_id: str
    athlete_name: str | None = None
    urgency_score: float
    urgency_label: str
    latest_memory_state_id: str | None = None
    latest_memory_state_at: str | None = None
    reasons: list[str] = Field(default_factory=list)


class VerifySuggestionRequest(BaseModel):
    decision: Literal["Approve", "Edit", "Ignore"]
    coach_notes: str | None = None
    edited_adjustment: dict | None = None


def _get_workflow(request: Request, principal: AuthenticatedPrincipal) -> CoachWorkflow:
    supabase_client = getattr(request.app.state, "supabase_client", None)
    whatsapp_service = getattr(request.app.state, "whatsapp_service", None)
    scope = resolve_coach_scope(principal)
    return CoachWorkflow(
        supabase_client=supabase_client,
        whatsapp_service=whatsapp_service,
        scope=scope,
    )


@router.get("/triage", response_model=list[CoachTriageResponseItem])
async def get_triage_queue(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Return a prioritised list of athletes needing coach attention."""
    workflow = _get_workflow(request, principal)
    try:
        items = await workflow.build_triage()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return [
        CoachTriageResponseItem(
            athlete_id=item.athlete_id,
            athlete_name=item.athlete_name,
            urgency_score=item.urgency_score,
            urgency_label=item.urgency_label,
            latest_memory_state_id=item.latest_memory_state_id,
            latest_memory_state_at=item.latest_memory_state_at,
            reasons=item.reasons,
        )
        for item in items
    ]


@router.post("/suggestions/{suggestion_id}/verify")
async def verify_suggestion(
    suggestion_id: str,
    body: VerifySuggestionRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Coach approves, edits, or ignores an AI-generated suggestion."""
    workflow = _get_workflow(request, principal)
    try:
        result = await workflow.verify_suggestion(
            suggestion_id,
            body.decision,
            coach_notes=body.coach_notes,
            edited_adjustment=body.edited_adjustment,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "suggestion_id": result.suggestion_id,
        "decision": result.decision,
        "status": result.status,
        "athlete_id": result.athlete_id,
        "athlete_name": result.athlete_name,
        "confirmation_sent": result.confirmation_sent,
        "confirmation_message_id": result.confirmation_message_id,
        "confirmation_error": result.confirmation_error,
    }


@router.get("/checkins")
async def list_checkins(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
    limit: int = 50,
):
    """List recent athlete check-ins stored from WhatsApp."""
    supabase_client = getattr(request.app.state, "supabase_client", None)
    if supabase_client is None:
        raise HTTPException(status_code=503, detail="Database not available")
    scope = resolve_coach_scope(principal)
    try:
        table = await supabase_client.table("athlete_checkins")
        query = table.select("*").eq("coach_id", scope.coach_id).order("created_at", desc=True).limit(limit)
        response = await query.execute()
        rows = response.data if hasattr(response, "data") else []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"checkins": rows, "count": len(rows)}
