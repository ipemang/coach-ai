"""Coach triage and verification API routes."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, BaseModel as _BaseModel, Field

from app.core.config import get_settings
from app.core.security import AuthenticatedPrincipal, require_roles, resolve_coach_scope
from app.services.coach_workflow import CoachWorkflow

logger = logging.getLogger(__name__)

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
    memory_state: dict = Field(default_factory=dict)
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
            hrv_flag=item.hrv_flag,
            soreness_score=item.soreness_score,
            missed_workouts=item.missed_workouts,
            memory_state=item.memory_state,
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


# ---------------------------------------------------------------------------
# COA-57: Manual Oura + Strava sync endpoints
# Called by the dashboard "Sync now" buttons on the athlete profile sidebar.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# COA-63: Coach onboarding — create coaches row + update methodology
# ---------------------------------------------------------------------------

class OnboardingProfileRequest(_BaseModel):
    full_name: str
    business_name: str | None = None
    sport_specialties: list[str] = Field(default_factory=list)
    whatsapp_number: str
    timezone: str | None = None
    email: str | None = None
    organization_id: str = "1"


class OnboardingMethodologyRequest(_BaseModel):
    persona_system_prompt: str
    methodology_playbook: dict = Field(default_factory=dict)


@router.post("/onboarding/profile")
async def create_coach_profile(
    body: OnboardingProfileRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("authenticated")),
):
    """Step 1 of coach onboarding. Creates the coaches row and links auth_user_id.
    Uses 'authenticated' role (not 'coach') since the coach row doesn't exist yet
    and the JWT hook hasn't stamped coach_id yet.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    # Check if coaches row already exists for this auth user (idempotent)
    try:
        existing = supabase.table("coaches").select("id").eq(
            "auth_user_id", principal.user_id
        ).execute()
        if existing.data:
            coach_id = existing.data[0]["id"]
            logger.info("[onboarding] Coach row already exists: %s", coach_id)
            return {"coach_id": coach_id, "created": False}
    except Exception as exc:
        logger.exception("[onboarding] Could not check existing coach row")
        raise HTTPException(status_code=500, detail="Database error") from exc

    # Create the coaches row
    try:
        insert_payload = {
            "full_name": body.full_name.strip(),
            "email": body.email or principal.email,
            "whatsapp_number": body.whatsapp_number.strip(),
            "phone_number": body.whatsapp_number.strip(),
            "organization_id": body.organization_id,
            "auth_user_id": principal.user_id,
            "methodology_playbook": {
                "sport_specialties": body.sport_specialties,
                "business_name": body.business_name or "",
                "timezone": body.timezone or "UTC",
            },
            "persona_system_prompt": "",
        }
        result = supabase.table("coaches").insert(insert_payload).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create coach profile")
        coach_id = result.data[0]["id"]
        logger.info("[onboarding] Created coach row %s for auth user %s", coach_id, principal.user_id[:8])
        return {"coach_id": coach_id, "created": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[onboarding] Failed to create coach row")
        raise HTTPException(status_code=500, detail=f"Could not create coach profile: {exc}") from exc


@router.post("/onboarding/methodology")
async def save_coach_methodology(
    body: OnboardingMethodologyRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("authenticated")),
):
    """Step 2 of coach onboarding. Saves methodology text + playbook to coaches row."""
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        result = supabase.table("coaches").update({
            "persona_system_prompt": body.persona_system_prompt.strip(),
            "methodology_playbook": body.methodology_playbook,
        }).eq("auth_user_id", principal.user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Coach profile not found — complete Step 1 first")
        return {"saved": True, "coach_id": result.data[0]["id"]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[onboarding] Failed to save methodology")
        raise HTTPException(status_code=500, detail=f"Could not save methodology: {exc}") from exc


# ---------------------------------------------------------------------------
# COA-63: Coach onboarding — Step 3 athlete invite (optional)
# ---------------------------------------------------------------------------

class OnboardingAthleteEntry(_BaseModel):
    full_name: str
    whatsapp_number: str


class OnboardingAthletesRequest(_BaseModel):
    athletes: list[OnboardingAthleteEntry] = Field(default_factory=list)


@router.post("/onboarding/athletes")
async def invite_onboarding_athletes(
    body: OnboardingAthletesRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("authenticated")),
):
    """Step 3 of coach onboarding. Creates stub athlete rows and queues WhatsApp invites.

    Non-fatal: if individual athlete creation fails, we log and skip rather than
    aborting the entire batch, so the coach always lands on Step 4.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    # Resolve the coach row for this auth user
    try:
        coach_row = supabase.table("coaches").select("id, organization_id").eq(
            "auth_user_id", principal.user_id
        ).single().execute()
        if not coach_row.data:
            raise HTTPException(status_code=404, detail="Coach profile not found — complete Step 1 first")
        coach_id = coach_row.data["id"]
        org_id = coach_row.data["organization_id"]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[onboarding/athletes] Failed to look up coach row")
        raise HTTPException(status_code=500, detail="Database error") from exc

    results: list[dict] = []
    for entry in body.athletes[:3]:  # cap at 3 during onboarding
        name = entry.full_name.strip()
        phone = entry.whatsapp_number.strip()
        if not name or not phone:
            continue
        try:
            result = supabase.table("athletes").insert({
                "full_name": name,
                "phone_number": phone,
                "whatsapp_number": phone,
                "coach_id": coach_id,
                "organization_id": org_id,
                "status": "invited",
                "current_state": {},
            }).execute()
            if result.data:
                athlete_id = result.data[0]["id"]
                results.append({"athlete_id": athlete_id, "name": name, "invited": True})
                logger.info("[onboarding/athletes] Created athlete %s for coach %s", athlete_id, coach_id)
            else:
                results.append({"name": name, "invited": False, "reason": "insert returned no data"})
        except Exception as exc:
            logger.warning("[onboarding/athletes] Could not create athlete %s: %s", name, exc)
            results.append({"name": name, "invited": False, "reason": str(exc)})

    return {"athletes": results, "total_invited": sum(1 for r in results if r.get("invited"))}


@router.post("/athletes/{athlete_id}/sync-oura")
async def sync_oura_for_athlete(
    athlete_id: str,
    request: Request,
):
    """Fetch today's (or yesterday's) Oura data for a specific athlete and
    write it into athletes.current_state. Returns the updated biometric fields."""
    from datetime import date, timedelta
    from app.services.oura_service import fetch_oura_daily, _merge_current_state

    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    # Fetch Oura token for this athlete
    try:
        token_rows = supabase.table("oura_tokens").select("access_token").eq("athlete_id", athlete_id).execute()
        if not token_rows.data:
            raise HTTPException(status_code=404, detail="No Oura token found for this athlete")
        access_token = token_rows.data[0]["access_token"]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not fetch Oura token: {exc}") from exc

    # Try today first, fall back to yesterday if no data
    today = date.today()
    oura_data = None
    for target in [today, today - timedelta(days=1)]:
        try:
            data = await fetch_oura_daily(access_token, target)
            if data.get("oura_readiness_score") is not None:
                oura_data = data
                break
            oura_data = data  # keep even if None scores — at least has sync_date
        except ValueError as exc:
            raise HTTPException(status_code=401, detail=f"Oura token rejected: {exc}") from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Oura API error: {exc}") from exc

    # Merge into current_state
    try:
        athlete_rows = supabase.table("athletes").select("current_state").eq("id", athlete_id).execute()
        existing = (athlete_rows.data[0].get("current_state") or {}) if athlete_rows.data else {}
        merged = _merge_current_state(existing, oura_data)
        supabase.table("athletes").update({"current_state": merged}).eq("id", athlete_id).execute()
        supabase.table("oura_tokens").update({
            "last_synced_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
        }).eq("athlete_id", athlete_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save Oura data: {exc}") from exc

    logger.info("[sync-oura] Synced athlete %s: %s", athlete_id, oura_data)
    return {"ok": True, "athlete_id": athlete_id, "oura": oura_data}


@router.post("/athletes/{athlete_id}/sync-strava")
async def sync_strava_for_athlete(
    athlete_id: str,
    request: Request,
):
    """Fetch recent Strava activities for a specific athlete and write into
    athletes.current_state. Returns the updated strava fields."""
    from app.services.strava_service import fetch_strava_weekly, _refresh_token_if_needed
    import httpx

    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    # Fetch Strava tokens
    try:
        token_rows = supabase.table("strava_tokens").select("*").eq("athlete_id", athlete_id).execute()
        if not token_rows.data:
            raise HTTPException(status_code=404, detail="No Strava token found for this athlete")
        token_row = token_rows.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not fetch Strava token: {exc}") from exc

    # Refresh token if needed
    try:
        async with httpx.AsyncClient() as client:
            access_token = await _refresh_token_if_needed(client, supabase, athlete_id, token_row)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=f"Strava token rejected: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Strava token refresh failed: {exc}") from exc

    # Fetch activities
    try:
        strava_data = await fetch_strava_weekly(access_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=f"Strava API rejected: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Strava API error: {exc}") from exc

    # Merge into current_state
    try:
        athlete_rows = supabase.table("athletes").select("current_state").eq("id", athlete_id).execute()
        existing = (athlete_rows.data[0].get("current_state") or {}) if athlete_rows.data else {}
        merged = {**existing, **strava_data}
        supabase.table("athletes").update({"current_state": merged}).eq("id", athlete_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save Strava data: {exc}") from exc

    logger.info("[sync-strava] Synced athlete %s: %s", athlete_id, strava_data)
    return {"ok": True, "athlete_id": athlete_id, "strava": strava_data}


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
        response = supabase_client.table("athlete_checkins").select("*").eq("coach_id", scope.coach_id).order("created_at", desc=True).limit(limit).execute()
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


# ---------------------------------------------------------------------------
# COA-64: AI reasoning engine — message classification, suggestion generation,
#          coach decision logging
# ---------------------------------------------------------------------------

from app.services.suggestion_engine import (
    run_pipeline,
    log_coach_decision,
    classify_message,
    PlanModificationProposal,
)
from app.services.usage_logger import UsageLogger
from app.services.llm_client import LLMResponse


class GenerateSuggestionRequest(_BaseModel):
    athlete_id: str
    message_text: str
    save: bool = True  # persist suggestion row to DB; set False for testing/preview


class PlanModificationResponse(_BaseModel):
    warranted: bool
    workout_id: str | None = None
    change_type: str
    change_value: str
    reasoning: str


class GenerateSuggestionResponse(_BaseModel):
    suggestion_id: str | None = None
    athlete_id: str
    athlete_name: str
    message_class: str
    classification_confidence: float
    message_draft: str           # raw, pre-persona (for coach transparency)
    message_personalized: str    # after Interaction Agent — what gets sent
    message_reasoning: str
    plan_modification: PlanModificationResponse | None = None
    total_latency_ms: int


class DecisionRequest(_BaseModel):
    action: Literal["approved", "rejected", "modified"]
    decision_type: Literal["message", "plan_modification"] = "message"
    final_message: str | None = None          # if modified
    final_plan_modification: dict | None = None  # if modified
    rejection_reason: str | None = None


@router.post("/suggestions/generate", response_model=GenerateSuggestionResponse)
async def generate_ai_suggestion(
    body: GenerateSuggestionRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-64: Run the full AI reasoning pipeline on an athlete message.

    1. Classifies the message (check_in / plan_question / flag / noise)
    2. Assembles context (biometrics, plan, history, methodology)
    3. Generates message draft + optional plan modification (ReasoningAgent)
    4. Wraps in coach persona (InteractionAgent)
    5. Optionally persists as a pending suggestion row

    Noise messages return immediately with no DB write and no coach notification.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    # Run the full pipeline (sync — LLM calls are blocking)
    try:
        result = run_pipeline(
            supabase=supabase,
            coach_id=coach_id,
            athlete_id=body.athlete_id,
            message_text=body.message_text,
        )
    except Exception as exc:
        logger.exception("[COA-64] Pipeline failed for athlete %s", body.athlete_id)
        raise HTTPException(status_code=502, detail=f"AI pipeline error: {exc}") from exc

    # Fire-and-forget token logging for all three LLM calls
    _log_pipeline_usage(supabase, result, coach_id, body.athlete_id, principal)

    # Noise — return immediately, nothing to show the coach
    if result.message_class == "noise":
        return GenerateSuggestionResponse(
            suggestion_id=None,
            athlete_id=body.athlete_id,
            athlete_name=result.athlete_name,
            message_class="noise",
            classification_confidence=result.classification_confidence,
            message_draft="",
            message_personalized="",
            message_reasoning="Message classified as noise — no coach action required.",
            plan_modification=None,
            total_latency_ms=result.total_latency_ms,
        )

    # Persist suggestion row if requested
    suggestion_id = None
    if body.save:
        suggestion_id = _persist_suggestion(
            supabase=supabase,
            coach_id=coach_id,
            athlete_id=body.athlete_id,
            result=result,
        )
        result.suggestion_id = suggestion_id

    plan_mod_resp = None
    if result.plan_modification and result.plan_modification.warranted:
        pm = result.plan_modification
        plan_mod_resp = PlanModificationResponse(
            warranted=True,
            workout_id=pm.workout_id,
            change_type=pm.change_type,
            change_value=pm.change_value,
            reasoning=pm.reasoning,
        )

    return GenerateSuggestionResponse(
        suggestion_id=suggestion_id,
        athlete_id=body.athlete_id,
        athlete_name=result.athlete_name,
        message_class=result.message_class,
        classification_confidence=result.classification_confidence,
        message_draft=result.message_draft,
        message_personalized=result.message_draft_personalized,
        message_reasoning=result.message_reasoning,
        plan_modification=plan_mod_resp,
        total_latency_ms=result.total_latency_ms,
    )


@router.post("/suggestions/{suggestion_id}/decide")
async def record_coach_decision(
    suggestion_id: str,
    body: DecisionRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-64: Log a coach decision (approve / reject / modify) on a suggestion.

    Records full before/after diff in coach_decisions for feedback loop training.
    On approval, updates the suggestion row status to 'approved'.
    On modification, stores the edited content and updates status to 'edited'.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    # Fetch the original suggestion
    try:
        row = supabase.table("suggestions").select("*").eq("id", suggestion_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        suggestion = row.data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error") from exc

    # Build original + final output for the decision log
    original_output = {
        "message_draft": suggestion.get("suggestion_text") or suggestion.get("message_draft") or "",
        "plan_modification": suggestion.get("plan_modification_payload"),
        "message_reasoning": suggestion.get("message_reasoning") or "",
    }

    # COA-65: Plan modification decisions are independent from message approval.
    # Update plan_modification_status and optionally apply the change to workouts.
    if body.decision_type == "plan_modification":
        pm_status = "approved" if body.action == "approved" else "rejected"
        try:
            supabase.table("suggestions").update(
                {"plan_modification_status": pm_status}
            ).eq("id", suggestion_id).execute()
        except Exception as exc:
            logger.warning("[COA-65] plan_modification_status update failed %s: %s", suggestion_id, exc)

        if body.action == "approved":
            _apply_plan_modification(supabase, suggestion)

        athlete_id = str(suggestion.get("athlete_id") or "")
        decision_id = log_coach_decision(
            supabase=supabase,
            coach_id=coach_id,
            athlete_id=athlete_id,
            suggestion_id=suggestion_id,
            decision_type="plan_modification",
            action=body.action,
            original_ai_output=original_output,
            final_output=original_output if body.action == "approved" else {},
            rejection_reason=body.rejection_reason,
        )
        logger.info("[COA-65] Plan mod decision: suggestion=%s action=%s status=%s", suggestion_id, body.action, pm_status)
        return {
            "suggestion_id": suggestion_id,
            "action": body.action,
            "plan_modification_status": pm_status,
            "decision_id": decision_id,
        }

    if body.action == "modified":
        final_output = {
            "message_draft": body.final_message or original_output["message_draft"],
            "plan_modification": body.final_plan_modification or original_output["plan_modification"],
        }
        new_status = "edited"
        update_payload: dict = {
            "status": new_status,
            "coach_decision": "Edit",
            "coach_notes": body.rejection_reason,
        }
        if body.final_message:
            update_payload["suggestion_text"] = body.final_message
        if body.final_plan_modification:
            update_payload["coach_edited_payload"] = body.final_plan_modification
    elif body.action == "approved":
        final_output = original_output
        new_status = "approved"
        update_payload = {"status": new_status, "coach_decision": "Approve"}
    else:  # rejected
        final_output = {}
        new_status = "ignored"
        update_payload = {
            "status": new_status,
            "coach_decision": "Ignore",
            "coach_notes": body.rejection_reason,
        }

    # Update suggestion row
    try:
        supabase.table("suggestions").update(update_payload).eq("id", suggestion_id).execute()
    except Exception as exc:
        logger.warning("[COA-64] Failed to update suggestion %s: %s", suggestion_id, exc)

    # Log decision for feedback loop
    athlete_id = str(suggestion.get("athlete_id") or "")
    decision_id = log_coach_decision(
        supabase=supabase,
        coach_id=coach_id,
        athlete_id=athlete_id,
        suggestion_id=suggestion_id,
        decision_type=body.decision_type,
        action=body.action,
        original_ai_output=original_output,
        final_output=final_output,
        rejection_reason=body.rejection_reason,
    )

    logger.info("[COA-64] Decision logged: suggestion=%s action=%s decision_id=%s",
                suggestion_id, body.action, decision_id)

    return {
        "suggestion_id": suggestion_id,
        "action": body.action,
        "new_status": new_status,
        "decision_id": decision_id,
    }


class EditPlanModRequest(_BaseModel):
    change_type: str = Field(..., description="reduce_duration | swap_type | move_day | remove")
    change_value: str = Field(..., description="New value — minutes, session type, ISO date, or 'remove'")
    reasoning: str | None = Field(default=None, description="Why the coach is changing this")


@router.patch("/suggestions/{suggestion_id}/edit-plan-mod")
async def edit_plan_modification(
    suggestion_id: str,
    body: EditPlanModRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-88: Edit the AI-proposed plan modification payload before approving.

    On first edit, the original AI payload is preserved in plan_modification_original
    for traceability. Subsequent edits update plan_modification_payload in place
    without overwriting the original.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    # Fetch suggestion + verify coach ownership
    try:
        row = supabase.table("suggestions").select("*").eq(
            "id", suggestion_id
        ).eq("coach_id", coach_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        suggestion = row.data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error") from exc

    existing_payload = suggestion.get("plan_modification_payload") or {}

    # Build updated payload — preserve workout_id and other AI fields, overwrite editable ones
    updated_payload = {
        **existing_payload,
        "change_type": body.change_type,
        "change_value": body.change_value,
    }
    if body.reasoning:
        updated_payload["coach_reasoning"] = body.reasoning

    update: dict = {"plan_modification_payload": updated_payload}

    # Preserve original AI payload on first edit only — never overwrite again
    if not suggestion.get("plan_modification_original"):
        update["plan_modification_original"] = existing_payload

    try:
        supabase.table("suggestions").update(update).eq("id", suggestion_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    original = update.get("plan_modification_original") or suggestion.get("plan_modification_original")
    logger.info(
        "[COA-88] Plan mod edited: suggestion=%s change_type=%s change_value=%s coach=%s",
        suggestion_id[:8], body.change_type, body.change_value, coach_id[:8],
    )
    return {
        "suggestion_id": suggestion_id,
        "plan_modification_payload": updated_payload,
        "plan_modification_original": original,
    }


@router.post("/suggestions/classify")
async def classify_athlete_message(
    body: GenerateSuggestionRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-64: Classify a message without running the full pipeline.

    Useful for quick triage previews on the dashboard without generating
    a full suggestion. Returns class + confidence + reason only.
    """
    try:
        result = classify_message(body.message_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Classification failed: {exc}") from exc

    return {
        "athlete_id": body.athlete_id,
        "message_class": result.message_class,
        "confidence": result.confidence,
        "reason": result.reason,
    }


# ── COA-65 helpers ─────────────────────────────────────────────────────────────

def _apply_plan_modification(supabase: Any, suggestion: dict) -> None:
    """Apply an approved plan modification payload to the workouts table."""
    payload = suggestion.get("plan_modification_payload") or {}
    if not isinstance(payload, dict):
        return
    workout_id = payload.get("workout_id")
    change_type = payload.get("change_type")
    change_value = str(payload.get("change_value", ""))
    if not (workout_id and change_type and change_value):
        logger.warning("[COA-65] plan_modification_payload missing fields: %s", payload)
        return
    try:
        if change_type == "reduce_duration":
            digits = "".join(c for c in change_value if c.isdigit())
            if digits:
                supabase.table("workouts").update({"duration_min": int(digits)}).eq("id", workout_id).execute()
        elif change_type == "swap_type":
            supabase.table("workouts").update({"session_type": change_value}).eq("id", workout_id).execute()
        elif change_type == "move_day":
            supabase.table("workouts").update({"scheduled_date": change_value}).eq("id", workout_id).execute()
        elif change_type == "remove":
            supabase.table("workouts").update({"status": "removed"}).eq("id", workout_id).execute()
        else:
            logger.warning("[COA-65] Unknown change_type '%s' for workout %s", change_type, workout_id)
    except Exception as exc:
        logger.warning("[COA-65] Failed to apply plan mod (workout=%s type=%s): %s", workout_id, change_type, exc)


# ── COA-64 helpers ─────────────────────────────────────────────────────────────

def _persist_suggestion(
    *,
    supabase: Any,
    coach_id: str,
    athlete_id: str,
    result,
) -> str | None:
    """Insert a pending suggestion row and return its id."""
    try:
        plan_mod_payload = None
        if result.plan_modification and result.plan_modification.warranted:
            pm = result.plan_modification
            plan_mod_payload = {
                "workout_id": pm.workout_id,
                "change_type": pm.change_type,
                "change_value": pm.change_value,
                "reasoning": pm.reasoning,
            }

        row = {
            "coach_id": coach_id,
            "athlete_id": athlete_id,
            "suggestion_text": result.message_draft_personalized or result.message_draft,
            "message_draft": result.message_draft,
            "message_reasoning": result.message_reasoning,
            "message_class": result.message_class,
            "classification_confidence": result.classification_confidence,
            "plan_modification_payload": plan_mod_payload,
            "plan_modification_status": "proposed" if plan_mod_payload else "none",
            "status": "pending",
            "ai_output_raw": result.raw_ai_output,
        }
        insert = supabase.table("suggestions").insert(row).execute()
        if insert.data:
            return str(insert.data[0]["id"])
    except Exception:
        logger.warning("[COA-64] Failed to persist suggestion (non-fatal)", exc_info=True)
    return None


@router.post("/athletes/{athlete_id}/resend-plan-link")
async def resend_plan_link(
    athlete_id: str,
    request: Request,
):
    """Regenerate a plan_access token and resend the /my-plan link via WhatsApp.

    No auth required — called from the internal Next.js server, not the browser.
    Invalidates existing plan_access tokens for this athlete before issuing a new one.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    rows = supabase.table("athletes").select("id, full_name, phone_number").eq("id", athlete_id).limit(1).execute()
    if not rows.data:
        raise HTTPException(status_code=404, detail="Athlete not found")
    athlete = rows.data[0]
    phone: str = athlete.get("phone_number") or ""

    # Invalidate any live plan_access tokens so old links stop working
    supabase.table("athlete_connect_tokens").update({
        "used_at": datetime.now(timezone.utc).isoformat(),
    }).eq("athlete_id", athlete_id).eq("purpose", "plan_access").is_("used_at", "null").execute()

    plan_token = secrets.token_urlsafe(32)
    supabase.table("athlete_connect_tokens").insert({
        "athlete_id": athlete_id,
        "token": plan_token,
        "purpose": "plan_access",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
    }).execute()

    base_url = "https://coach-ai-production-a5aa.up.railway.app"
    plan_url = f"{base_url}/my-plan?token={plan_token}"

    sent = False
    if phone and not phone.startswith("web:"):
        whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
        if whatsapp_client:
            try:
                await whatsapp_client.send_message(
                    to=phone,
                    body=(
                        f"📋 Here's your updated training plan link:\n"
                        f"{plan_url}\n\n"
                        "Bookmark this — it's your personal plan page."
                    ),
                )
                sent = True
            except Exception as exc:
                logger.warning("[resend_plan_link] WhatsApp send failed for %s: %s", athlete_id, exc)

    logger.info("[resend_plan_link] athlete=%s sent=%s", athlete_id, sent)
    return {"sent": sent, "plan_url": plan_url, "athlete_id": athlete_id}


# ── COA-89: Soft-delete athlete ───────────────────────────────────────────────

@router.delete("/athletes/{athlete_id}", status_code=200)
async def archive_athlete(
    athlete_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-89: Soft-delete an athlete — sets archived_at, expires tokens, removes OAuth tokens.

    The athlete row is NOT hard-deleted. Archived athletes are excluded from
    all active webhook lookups and dashboard queries. The coach can still view
    historical data but the athlete cannot receive messages or access /my-plan.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    # Verify athlete belongs to this coach
    try:
        row = supabase.table("athletes").select("id, full_name").eq(
            "id", athlete_id
        ).eq("coach_id", coach_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Athlete not found")
        athlete_name = row.data.get("full_name", "Unknown")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error") from exc

    archived_at = datetime.now(timezone.utc).isoformat()

    # 1. Soft-delete: stamp archived_at
    try:
        supabase.table("athletes").update({
            "archived_at": archived_at,
        }).eq("id", athlete_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Archive failed: {exc}") from exc

    # 2. Expire all active connect tokens so old links stop working
    try:
        supabase.table("athlete_connect_tokens").update({
            "used_at": archived_at,
        }).eq("athlete_id", athlete_id).is_("used_at", "null").execute()
    except Exception as exc:
        logger.warning("[COA-89] Failed to expire tokens for athlete=%s: %s", athlete_id[:8], exc)

    # 3. Remove Strava OAuth tokens
    try:
        supabase.table("strava_tokens").delete().eq("athlete_id", athlete_id).execute()
    except Exception as exc:
        logger.warning("[COA-89] Failed to delete Strava tokens for athlete=%s: %s", athlete_id[:8], exc)

    # 4. Remove Oura tokens
    try:
        supabase.table("oura_tokens").delete().eq("athlete_id", athlete_id).execute()
    except Exception as exc:
        logger.warning("[COA-89] Failed to delete Oura tokens for athlete=%s: %s", athlete_id[:8], exc)

    logger.info("[COA-89] Archived athlete=%s name=%s coach=%s", athlete_id[:8], athlete_name, coach_id[:8])
    return {
        "archived": True,
        "athlete_id": athlete_id,
        "athlete_name": athlete_name,
        "archived_at": archived_at,
    }


# ── COA-78: Add athlete from dashboard ────────────────────────────────────────

class AddAthleteRequest(_BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    phone_number: str | None = None
    email: str | None = None
    expires_in_days: int = Field(default=30, ge=1, le=365)


@router.post("/athletes/invite")
async def add_athlete_invite(
    body: AddAthleteRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-78: Coach adds a new athlete from the dashboard.

    Creates an onboard invite token scoped to the coach, optionally sends a
    WhatsApp invite if a phone number is provided, and returns the invite URL
    so the coach can share it manually if WhatsApp isn't available.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    # Fetch coach's WhatsApp number for the token + the invite message
    try:
        coach_row = supabase.table("coaches").select("whatsapp_number").eq("id", coach_id).single().execute()
        coach_whatsapp = (coach_row.data or {}).get("whatsapp_number") if coach_row.data else None
    except Exception:
        coach_whatsapp = None

    settings = get_settings()
    base_url = getattr(settings, "base_url", "https://coach-ai-production-a5aa.up.railway.app")

    # Create the onboard invite token
    token_str = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)).isoformat()

    try:
        supabase.table("athlete_connect_tokens").insert({
            "token": token_str,
            "purpose": "onboard",
            "coach_id": coach_id,
            "organization_id": str(scope.organization_id),
            "coach_whatsapp_number": coach_whatsapp,
            "expires_at": expires_at,
        }).execute()
    except Exception as exc:
        logger.exception("[COA-78] Failed to create invite token for coach %s", coach_id)
        raise HTTPException(status_code=500, detail="Failed to create invite token") from exc

    invite_url = f"{base_url}/onboard?token={token_str}"
    sent_whatsapp = False

    # Send WhatsApp invite if phone number provided
    phone = body.phone_number.strip() if body.phone_number else None
    if phone and not phone.startswith("web:"):
        whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
        if whatsapp_client:
            try:
                name = body.full_name.strip()
                await whatsapp_client.send_message(
                    to=phone,
                    body=(
                        f"Hi {name}! Your coach has invited you to join Coach.AI.\n\n"
                        f"Complete your athlete profile here:\n{invite_url}\n\n"
                        f"This link expires in {body.expires_in_days} days."
                    ),
                )
                sent_whatsapp = True
                logger.info("[COA-78] Sent WhatsApp invite to %s for coach %s", phone, coach_id)
            except Exception as exc:
                logger.warning("[COA-78] WhatsApp send failed: %s", exc)

    logger.info("[COA-78] Invite created: coach=%s token=%s sent=%s", coach_id, token_str[:8], sent_whatsapp)
    return {
        "invite_url": invite_url,
        "token": token_str,
        "sent_whatsapp": sent_whatsapp,
        "expires_at": expires_at,
        "coach_id": coach_id,
    }


def _log_pipeline_usage(supabase, result, coach_id: str, athlete_id: str, principal) -> None:
    """Log token usage for all three pipeline stages (non-blocking)."""
    from app.services.llm_client import LLMResponse

    stages = [
        ("check_in", result.classifier_tokens_in, result.classifier_tokens_out, "classifier"),
        ("analysis", result.reasoning_tokens_in, result.reasoning_tokens_out, "reasoning"),
        ("interaction_wrap", result.persona_tokens_in, result.persona_tokens_out, "interaction_agent"),
    ]
    for event_type, t_in, t_out, stage in stages:
        if t_in or t_out:
            UsageLogger.log_sync(
                supabase=supabase,
                response=LLMResponse(
                    content="",
                    input_tokens=t_in,
                    output_tokens=t_out,
                    model="llama-3.1-70b-versatile",
                    latency_ms=0,
                ),
                event_type=event_type,
                coach_id=coach_id,
                athlete_id=athlete_id,
                endpoint=f"/api/v1/coach/suggestions/generate#{stage}",
            )


# ── COA-73: Video / frame analysis ────────────────────────────────────────────

class VideoAnalysisRequest(_BaseModel):
    frame_urls: list[str] = Field(..., min_length=1, max_length=4, description="1–4 public image URLs")
    discipline: str = Field(..., min_length=1, description="run, bike, swim, or triathlon")
    notes: str | None = Field(default=None, description="Coach notes to focus the analysis")


@router.post("/athletes/{athlete_id}/analyze-video")
async def analyze_athlete_video(
    athlete_id: str,
    body: VideoAnalysisRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-73: Analyze athlete technique from frame images using GPT-4o vision.

    Accepts up to 4 frame image URLs extracted from a training video.
    Returns structured technique feedback: form score, strengths, issues,
    and actionable recommendations scoped to the athlete's discipline and profile.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)

    # Fetch athlete profile for context (non-fatal if missing)
    athlete_profile: dict = {}
    try:
        row = supabase.table("athletes").select("full_name, stable_profile").eq("id", athlete_id).eq(
            "coach_id", str(scope.coach_id)
        ).single().execute()
        if row.data:
            athlete_profile = row.data.get("stable_profile") or {}
            athlete_profile["_name"] = row.data.get("full_name", "")
    except Exception as exc:
        logger.warning("[COA-73] Could not fetch athlete %s profile: %s", athlete_id, exc)

    from app.services.video_analysis import VideoAnalysisService
    from starlette.concurrency import run_in_threadpool

    try:
        service = VideoAnalysisService()
        result = await run_in_threadpool(
            service.analyze_frames,
            frame_urls=body.frame_urls,
            discipline=body.discipline,
            athlete_profile=athlete_profile,
            coach_notes=body.notes,
        )
    except Exception as exc:
        logger.exception("[COA-73] Video analysis failed for athlete %s", athlete_id)
        raise HTTPException(status_code=502, detail=f"Video analysis failed: {exc}") from exc

    logger.info(
        "[COA-73] athlete=%s discipline=%s score=%d frames=%d latency=%dms",
        athlete_id, result.discipline, result.form_score, result.frame_count, result.latency_ms,
    )

    return {
        "athlete_id": athlete_id,
        "discipline": result.discipline,
        "form_score": result.form_score,
        "strengths": result.strengths,
        "issues": result.issues,
        "recommendations": result.recommendations,
        "summary": result.raw_analysis,
        "frame_count": result.frame_count,
        "latency_ms": result.latency_ms,
        "model": result.model,
    }
