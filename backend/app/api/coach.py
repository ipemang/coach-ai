"""Coach triage and verification API routes."""
from __future__ import annotations
from dataclasses import asdict
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

class SuggestionResponse(BaseModel):
    id: str
    athlete_id: str
    athlete_display_name: str | None
    suggestion_text: str | None
    status: str
    created_at: str

class VerifySuggestionRequest(BaseModel):
    decision: CoachDecision
    coach_notes: str | None = None
    edited_adjustment: str | None = None

@router.get("/triage", response_model=list[CoachTriageResponseItem])
async def get_coach_triage(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles(["coach"])),
):
    """Get the triage list of athletes needing attention."""
    scope = resolve_coach_scope(principal)
    workflow = CoachWorkflow(
        supabase_client=request.app.state.supabase_client,
        scope=scope
    )
    items = await workflow.build_triage()
    return [CoachTriageResponseItem(**asdict(item)) for item in items]

@router.get("/suggestions/pending", response_model=List[SuggestionResponse])
async def get_pending_suggestions(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles(["coach"])),
):
    """Get all pending AI suggestions for athlete replies."""
    supabase = request.app.state.supabase_client
    # In a real app, you'd filter by coach_id from principal/scope
    res = await supabase.table("suggestions") \
        .select("*") \
        .eq("status", "pending") \
        .order("created_at", ascending=False) \
        .execute()
    
    return [
        SuggestionResponse(
            id=str(row["id"]),
            athlete_id=row["athlete_id"],
            athlete_display_name=row.get("athlete_display_name"),
            suggestion_text=row.get("suggestion_text"),
            status=row["status"],
            created_at=row["created_at"]
        ) for row in res.data
    ]

@router.post("/suggestions/{suggestion_id}/verify")
async def verify_suggestion(
    suggestion_id: str,
    body: VerifySuggestionRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles(["coach"])),
):
    """Approve, Edit, or Ignore a suggested athlete reply."""
    scope = resolve_coach_scope(principal)
    workflow = CoachWorkflow(
        supabase_client=request.app.state.supabase_client,
        whatsapp_service=request.app.state.whatsapp_service,
        scope=scope
    )
    
    try:
        result = await workflow.verify_suggestion(
            suggestion_id=suggestion_id,
            decision=body.decision,
            coach_notes=body.coach_notes,
            edited_adjustment=body.edited_adjustment,
            send_confirmation=True # This triggers the WhatsApp send on Approve
        )
        return {"status": "success", "decision": result.decision, "confirmation_sent": result.confirmation_sent}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(exc)}")
