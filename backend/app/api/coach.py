"""Coach triage and verification API routes."""
from __future__ import annotations
import logging
from typing import Any, Literal, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel as _BaseModel

logger = logging.getLogger(__name__)
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
        logger.exception("Triage build failed")
        raise HTTPException(status_code=500, detail="Internal server error") from exc
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
        logger.exception("Suggestion verification failed")
        raise HTTPException(status_code=500, detail="Internal server error") from exc
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


class SendSuggestionRequest(_BaseModel):
    phone_number: str
    message: str


@router.post("/suggestions/{suggestion_id}/send")
async def send_suggestion_to_athlete(
    suggestion_id: str,
    body: SendSuggestionRequest,
    request: Request,
):
    """Send an approved suggestion to the athlete via WhatsApp.

    Called by the Next.js dashboard after the coach approves a suggestion.
    No auth required here — request comes from the internal Next.js server, not the browser.
    The DB update is already done by the time this is called.
    """
    whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
    if whatsapp_client is None:
        raise HTTPException(status_code=503, detail="WhatsApp client not available")

    phone = body.phone_number.strip()
    message = body.message.strip()

    if not phone or not message:
        raise HTTPException(status_code=400, detail="phone_number and message are required")

    if phone.startswith("web:"):
        # Athlete onboarded via web with no real phone — can't send WhatsApp
        return {"sent": False, "reason": "athlete has no WhatsApp number (web onboarding only)"}

    try:
        await whatsapp_client.send_message(to=phone, body=message)
        logger.info("[send_suggestion] Sent suggestion %s to %s", suggestion_id, phone[:6] + "****")
    except Exception as exc:
        logger.exception("[send_suggestion] Failed to send suggestion %s", suggestion_id)
        raise HTTPException(status_code=500, detail=f"WhatsApp send failed: {exc}") from exc

    # Mark sent_at on the suggestion row
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase:
        try:
            from datetime import datetime, timezone
            supabase.table("suggestions").update({
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", suggestion_id).execute()
        except Exception:
            pass  # Non-fatal

    return {"sent": True, "suggestion_id": suggestion_id}


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
        logger.exception("Failed to list checkins")
        raise HTTPException(status_code=500, detail="Internal server error") from exc
    return {"checkins": rows, "count": len(rows)}


# ---------------------------------------------------------------------------
# COA-54: Office hours endpoints
# ---------------------------------------------------------------------------

class DayHours(_BaseModel):
    start: str  # "09:00"
    end: str    # "18:00"


class OfficeHoursPayload(_BaseModel):
    timezone: str = "America/New_York"
    mon: Optional[list[str]] = None  # ["09:00", "18:00"] or None = autonomous
    tue: Optional[list[str]] = None
    wed: Optional[list[str]] = None
    thu: Optional[list[str]] = None
    fri: Optional[list[str]] = None
    sat: Optional[list[str]] = None
    sun: Optional[list[str]] = None
    ai_autonomy_override: bool = False


class OfficeHoursResponse(_BaseModel):
    coach_id: str
    office_hours: Optional[dict]
    ai_autonomy_override: bool
    is_currently_autonomous: bool


@router.get("/office-hours", response_model=OfficeHoursResponse)
async def get_office_hours(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Get the coach's current office hours config and autonomy status."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    from datetime import datetime

    supabase_client = getattr(request.app.state, "supabase_client", None)
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    result = supabase_client.table("coaches").select(
        "id, office_hours, ai_autonomy_override"
    ).eq("id", coach_id).limit(1).execute()

    row = result.data[0] if result.data else {}
    office_hours = row.get("office_hours")
    override = bool(row.get("ai_autonomy_override", False))

    # Compute current autonomy status
    _DAY_MAP = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    is_autonomous = override
    if not is_autonomous and office_hours and isinstance(office_hours, dict):
        tz_name = office_hours.get("timezone", "UTC")
        try:
            tz = ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, Exception):
            tz = ZoneInfo("UTC")
        now = datetime.now(tz)
        day_key = _DAY_MAP[now.weekday()]
        hours = office_hours.get(day_key)
        if not hours or len(hours) < 2:
            is_autonomous = True
        else:
            try:
                sh, sm = [int(x) for x in hours[0].split(":")]
                eh, em = [int(x) for x in hours[1].split(":")]
                start = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
                end = now.replace(hour=eh, minute=em, second=0, microsecond=0)
                is_autonomous = not (start <= now < end)
            except Exception:
                is_autonomous = False

    return OfficeHoursResponse(
        coach_id=coach_id,
        office_hours=office_hours,
        ai_autonomy_override=override,
        is_currently_autonomous=is_autonomous,
    )


@router.patch("/office-hours")
async def update_office_hours(
    body: OfficeHoursPayload,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Update the coach's office hours and autonomy override."""
    supabase_client = getattr(request.app.state, "supabase_client", None)
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    # Build JSONB from payload — only include days that were provided
    days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    office_hours: dict = {"timezone": body.timezone}
    for day in days:
        val = getattr(body, day, None)
        if val is not None:
            office_hours[day] = val

    try:
        supabase_client.table("coaches").update({
            "office_hours": office_hours,
            "ai_autonomy_override": body.ai_autonomy_override,
        }).eq("id", coach_id).execute()
    except Exception as exc:
        logger.exception("Failed to update office hours for coach %s", coach_id)
        raise HTTPException(status_code=500, detail="Failed to save office hours") from exc

    logger.info("[COA-54] Updated office hours for coach=%s override=%s", coach_id, body.ai_autonomy_override)
    return {"status": "updated", "coach_id": coach_id, "ai_autonomy_override": body.ai_autonomy_override}


@router.patch("/autonomy-override")
async def toggle_autonomy_override(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Quick toggle for ai_autonomy_override — flips current value."""
    supabase_client = getattr(request.app.state, "supabase_client", None)
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    result = supabase_client.table("coaches").select("ai_autonomy_override").eq("id", coach_id).limit(1).execute()
    current = bool(result.data[0].get("ai_autonomy_override", False)) if result.data else False
    new_value = not current

    supabase_client.table("coaches").update({"ai_autonomy_override": new_value}).eq("id", coach_id).execute()

    logger.info("[COA-54] Toggled autonomy override for coach=%s: %s → %s", coach_id, current, new_value)
    return {"coach_id": coach_id, "ai_autonomy_override": new_value}
