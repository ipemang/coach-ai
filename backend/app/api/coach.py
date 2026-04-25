"""Coach triage and verification API routes."""
from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, timedelta, timezone
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
    email: str | None = None  # COA-93: optional email — triggers invite token generation


class OnboardingAthletesRequest(_BaseModel):
    athletes: list[OnboardingAthleteEntry] = Field(default_factory=list)


@router.post("/onboarding/athletes")
async def invite_onboarding_athletes(
    body: OnboardingAthletesRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("authenticated")),
):
    """Step 3 of coach onboarding. Creates stub athlete rows and queues WhatsApp invites.

    If an athlete entry includes an email address, a personalized invite token is
    automatically generated and (if WhatsApp is available) sent to the athlete's phone.

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

    import secrets as _secrets
    from app.core.config import get_settings as _get_settings

    settings = _get_settings()
    frontend_base = settings.frontend_url
    whatsapp_client = getattr(request.app.state, "whatsapp_client", None)

    results: list[dict] = []
    for entry in body.athletes[:3]:  # cap at 3 during onboarding
        name = entry.full_name.strip()
        phone = entry.whatsapp_number.strip()
        if not name or not phone:
            continue
        email = (entry.email or "").strip() or None
        try:
            insert_payload: dict = {
                "full_name": name,
                "phone_number": phone,
                "whatsapp_number": phone,
                "coach_id": coach_id,
                "organization_id": org_id,
                "status": "invited",
                "current_state": {},
            }
            if email:
                insert_payload["email"] = email

            result = supabase.table("athletes").insert(insert_payload).execute()
            if not result.data:
                results.append({"name": name, "invited": False, "reason": "insert returned no data"})
                continue

            athlete_id = result.data[0]["id"]
            invite_url: str | None = None
            invite_token: str | None = None
            whatsapp_sent = False

            # COA-93: generate invite token if email was provided
            if email:
                try:
                    raw_token = _secrets.token_hex(32)
                    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
                    supabase.table("athlete_invite_tokens").insert({
                        "token": raw_token,
                        "coach_id": coach_id,
                        "athlete_id": athlete_id,
                        "email": email,
                        "expires_at": expires_at,
                    }).execute()
                    invite_token = raw_token
                    invite_url = f"{frontend_base.rstrip('/')}/athlete/join?token={raw_token}"

                    # Send invite via WhatsApp if phone is real
                    if not phone.startswith("web:") and whatsapp_client:
                        try:
                            msg = (
                                f"Hi {name} 👋\n\n"
                                f"You've been invited to join Andes.IA — your personal training platform.\n\n"
                                f"Create your account here (link valid 7 days):\n{invite_url}"
                            )
                            import asyncio
                            asyncio.ensure_future(whatsapp_client.send_message(to=phone, body=msg))
                            whatsapp_sent = True
                        except Exception:
                            pass
                except Exception as ie:
                    logger.warning("[onboarding/athletes] Could not generate invite for %s: %s", name, ie)

            results.append({
                "athlete_id": athlete_id,
                "name": name,
                "invited": True,
                "invite_url": invite_url,
                "whatsapp_sent": whatsapp_sent,
            })
            logger.info("[onboarding/athletes] Created athlete %s for coach %s", athlete_id, coach_id)
        except Exception as exc:
            logger.warning("[onboarding/athletes] Could not create athlete %s: %s", name, exc)
            results.append({"name": name, "invited": False, "reason": str(exc)})

    # COA-100: mark coach onboarding complete now that Step 3 is done
    try:
        supabase.table("coaches").update({"onboarding_complete": True}).eq("id", coach_id).execute()
        logger.info("[onboarding/athletes] Marked coach %s onboarding_complete=true", coach_id)
    except Exception:
        pass  # non-fatal

    return {"athletes": results, "total_invited": sum(1 for r in results if r.get("invited"))}


# ---------------------------------------------------------------------------
# COA-100: Coach onboarding status endpoint
# ---------------------------------------------------------------------------

@router.get("/onboarding/status")
async def get_onboarding_status(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("authenticated")),
):
    """Returns the coach's onboarding completion state.

    Called by /auth/callback after email confirmation to determine where to redirect:
    - onboarding_complete=false  → /dashboard/onboarding (Steps 1-3)
    - onboarding_complete=true   → /dashboard
    - no coach row found         → /dashboard/onboarding (first login)
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        row = supabase.table("coaches").select(
            "id, full_name, onboarding_complete"
        ).eq("auth_user_id", principal.user_id).single().execute()
    except Exception:
        # No coach row yet — first login after email confirmation
        return {"has_coach_row": False, "onboarding_complete": False, "coach_id": None}

    if not row.data:
        return {"has_coach_row": False, "onboarding_complete": False, "coach_id": None}

    return {
        "has_coach_row": True,
        "onboarding_complete": row.data.get("onboarding_complete", False),
        "coach_id": row.data.get("id"),
        "full_name": row.data.get("full_name"),
    }


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
    # COA-101: also write snapshot for baseline tracking
    try:
        from app.services.oura_service import _upsert_biometric_snapshot
        _upsert_biometric_snapshot(supabase, athlete_id, target, oura_data)
    except Exception:
        pass  # non-fatal
    return {"ok": True, "athlete_id": athlete_id, "oura": oura_data}


@router.get("/athletes/{athlete_id}/biometric-baseline")
async def get_biometric_baseline(
    athlete_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
):
    """COA-101: Return 30-day rolling biometric averages for a single athlete.

    Used by the dashboard to show trend delta vs. personal baseline.
    Returns null averages if fewer than 3 days of data exist (not enough for a baseline).
    """
    from datetime import date, timedelta

    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)

    # Verify athlete belongs to this coach
    try:
        ath = supabase.table("athletes").select("id").eq("id", athlete_id).eq(
            "coach_id", scope.coach_id
        ).single().execute()
        if not ath.data:
            raise HTTPException(status_code=404, detail="Athlete not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Athlete not found") from exc

    # Fetch last 30 days of snapshots
    since = (date.today() - timedelta(days=30)).isoformat()
    try:
        rows = supabase.table("biometric_snapshots").select(
            "snapshot_date, readiness, hrv, sleep"
        ).eq("athlete_id", athlete_id).gte("snapshot_date", since).order(
            "snapshot_date", desc=True
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not fetch snapshots") from exc

    data = rows.data or []

    def _avg(field: str) -> float | None:
        vals = [r[field] for r in data if r.get(field) is not None]
        if len(vals) < 3:
            return None
        return round(sum(vals) / len(vals), 1)

    return {
        "athlete_id": athlete_id,
        "days_of_data": len(data),
        "readiness_avg": _avg("readiness"),
        "hrv_avg": _avg("hrv"),
        "sleep_avg": _avg("sleep"),
    }


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


# ── COA-103: Morning pulse configuration ──────────────────────────────────────

class MorningPulseConfigRequest(_BaseModel):
    questions: list[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description="1–5 questions to ask the athlete each morning (default 3)",
    )
    morning_pulse_time: str = Field(
        default="07:30",
        description="Local time to send the pulse (HH:MM, 24-hour). Athlete's timezone is used.",
    )


@router.patch("/athletes/{athlete_id}/morning-pulse")
async def update_morning_pulse_config(
    athlete_id: str,
    body: MorningPulseConfigRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-103: Update the morning pulse questions and send time for an athlete.

    Validates the athlete belongs to this coach before writing.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    # Verify athlete belongs to this coach
    try:
        row = supabase.table("athletes").select("id").eq(
            "id", athlete_id
        ).eq("coach_id", coach_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Athlete not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error") from exc

    # Validate time format HH:MM
    import re
    if not re.match(r"^\d{2}:\d{2}$", body.morning_pulse_time):
        raise HTTPException(status_code=400, detail="morning_pulse_time must be HH:MM (e.g. 07:30)")

    try:
        supabase.table("athletes").update({
            "morning_pulse_questions": body.questions,
            "morning_pulse_time": body.morning_pulse_time,
        }).eq("id", athlete_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save config: {exc}") from exc

    logger.info(
        "[COA-103] Morning pulse config updated: athlete=%s questions=%d time=%s coach=%s",
        athlete_id[:8], len(body.questions), body.morning_pulse_time, coach_id[:8],
    )
    return {
        "athlete_id": athlete_id,
        "questions": body.questions,
        "morning_pulse_time": body.morning_pulse_time,
    }


@router.get("/athletes/{athlete_id}/morning-pulse")
async def get_morning_pulse_config(
    athlete_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-103: Get the morning pulse config + today's session (if any) for an athlete."""
    from app.services.morning_pulse import DEFAULT_QUESTIONS
    from datetime import date

    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    try:
        row = supabase.table("athletes").select(
            "id, morning_pulse_questions, morning_pulse_time"
        ).eq("id", athlete_id).eq("coach_id", coach_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Athlete not found")
        athlete = row.data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error") from exc

    # Fetch today's completed session if it exists
    today_session = None
    try:
        sess = supabase.table("morning_pulse_sessions").select(
            "id, session_date, questions, answers, summary_text, completed"
        ).eq("athlete_id", athlete_id).eq(
            "session_date", date.today().isoformat()
        ).limit(1).execute()
        today_session = sess.data[0] if sess.data else None
    except Exception:
        pass  # non-fatal

    questions = athlete.get("morning_pulse_questions") or DEFAULT_QUESTIONS
    return {
        "athlete_id": athlete_id,
        "questions": questions,
        "morning_pulse_time": athlete.get("morning_pulse_time") or "07:30",
        "today_session": today_session,
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
                        f"Hi {name}! Your coach has invited you to join Andes.IA.\n\n"
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


# ── COA-102: Daily coach digest ────────────────────────────────────────────────

_DIGEST_STALE_HOURS = 6  # regenerate after 6 hours


@router.get("/digest")
async def get_coach_digest(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-102: Return the cached daily digest for this coach.

    Returns null if no digest has been generated yet. The dashboard calls
    POST /digest/generate on first load after 6 AM to refresh a stale digest,
    then polls this endpoint to display the result.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    try:
        row = supabase.table("coaches").select("daily_digest").eq("id", coach_id).single().execute()
        digest = (row.data or {}).get("daily_digest")
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error") from exc

    return {"coach_id": coach_id, "digest": digest}


@router.post("/digest/generate")
async def generate_coach_digest(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
    force: bool = False,
):
    """COA-102: Generate (or refresh) the daily coach briefing using AI.

    Checks if the existing digest is stale (> 6 hours old). If it is — or
    force=true — re-runs the LLM pipeline and caches the result in
    coaches.daily_digest.

    The digest contains:
    - summary: 3–5 sentence overview of the squad's status today
    - athlete_flags: [{athlete_id, name, reason}] — athletes needing attention
    - generated_at: ISO timestamp

    This is a synchronous LLM call (~2–4 s). The frontend fires-and-forgets it
    on first load after 6 AM, then polls GET /digest to display the result.
    """
    from starlette.concurrency import run_in_threadpool
    from app.services.llm_client import LLMClient

    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)

    # ── 1. Check staleness ────────────────────────────────────────────────────
    try:
        coach_row = supabase.table("coaches").select(
            "id, full_name, persona_system_prompt, methodology_playbook, daily_digest"
        ).eq("id", coach_id).single().execute()
        if not coach_row.data:
            raise HTTPException(status_code=404, detail="Coach not found")
        coach = coach_row.data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error") from exc

    existing_digest = coach.get("daily_digest") or {}
    if not force and existing_digest.get("generated_at"):
        try:
            generated_at = datetime.fromisoformat(existing_digest["generated_at"])
            age_hours = (datetime.now(timezone.utc) - generated_at).total_seconds() / 3600
            if age_hours < _DIGEST_STALE_HOURS:
                return {"coach_id": coach_id, "digest": existing_digest, "regenerated": False}
        except (ValueError, TypeError):
            pass  # malformed timestamp — regenerate

    # ── 2. Fetch squad data ───────────────────────────────────────────────────
    try:
        athletes_resp = supabase.table("athletes").select(
            "id, full_name, current_state"
        ).eq("coach_id", coach_id).is_("archived_at", "null").execute()
        athletes = athletes_resp.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not fetch athletes") from exc

    # Fetch last 7 days of workouts for the whole squad in one query
    from datetime import date, timedelta
    seven_days_ago = (date.today() - timedelta(days=6)).isoformat()
    athlete_ids = [a["id"] for a in athletes]
    workout_summary: dict[str, dict] = {}
    if athlete_ids:
        try:
            wk_resp = supabase.table("workouts").select(
                "athlete_id, scheduled_date, status, session_type"
            ).in_("athlete_id", athlete_ids).gte("scheduled_date", seven_days_ago).execute()
            for w in (wk_resp.data or []):
                aid = w["athlete_id"]
                if aid not in workout_summary:
                    workout_summary[aid] = {"completed": 0, "missed": 0, "total": 0}
                workout_summary[aid]["total"] += 1
                if w.get("status") == "completed":
                    workout_summary[aid]["completed"] += 1
                elif w.get("status") == "missed":
                    workout_summary[aid]["missed"] += 1
        except Exception:
            pass  # non-fatal — degrade gracefully

    # ── 3. Build prompt context ───────────────────────────────────────────────
    athlete_lines: list[str] = []
    flagged_athletes: list[dict] = []

    for a in athletes:
        name = a.get("full_name", "Unknown")
        cs = a.get("current_state") or {}
        wk = workout_summary.get(a["id"], {"completed": 0, "missed": 0, "total": 0})

        # Predictive flags from COA-38
        pred_flags = cs.get("predictive_flags") or []
        high_flags = [f for f in pred_flags if isinstance(f, dict) and f.get("priority") in ("high", "critical")]

        # Biometric readings
        readiness = cs.get("oura_readiness_score")
        hrv = cs.get("oura_avg_hrv")
        sleep = cs.get("oura_sleep_score")

        bio_str = ""
        bio_parts = []
        if readiness is not None:
            bio_parts.append(f"readiness={readiness}")
        if hrv is not None:
            bio_parts.append(f"HRV={hrv}")
        if sleep is not None:
            bio_parts.append(f"sleep={sleep}")
        if bio_parts:
            bio_str = f" | biometrics: {', '.join(bio_parts)}"

        workout_str = f"workouts last 7d: {wk['completed']}/{wk['total']} done, {wk['missed']} missed"
        flags_str = ""
        if high_flags:
            flag_labels = [f.get("label", f.get("code", "flag")) for f in high_flags[:2]]
            flags_str = f" ⚠ FLAGS: {', '.join(flag_labels)}"
            for hf in high_flags[:2]:
                flagged_athletes.append({
                    "athlete_id": a["id"],
                    "name": name,
                    "reason": hf.get("reason") or hf.get("label") or "attention required",
                })

        athlete_lines.append(f"- {name}: {workout_str}{bio_str}{flags_str}")

    squad_block = "\n".join(athlete_lines) if athlete_lines else "(no active athletes)"

    persona = (coach.get("persona_system_prompt") or "").strip()
    playbook = coach.get("methodology_playbook") or {}
    sport = playbook.get("sport_specialties", [])
    sport_str = ", ".join(sport) if sport else "endurance"

    system_prompt = (
        f"You are the AI assistant for a {sport_str} coach. "
        f"Write the coach's morning briefing: a concise 3-5 sentence summary "
        f"of their squad's current status based on the data below. "
        f"Highlight athletes who need attention, patterns in missed workouts, "
        f"and biometric concerns. Be direct and practical — the coach is busy. "
        f"No greetings, no sign-offs. Just the briefing.\n\n"
        f"{'Coach methodology context: ' + persona[:400] if persona else ''}"
    ).strip()

    user_prompt = (
        f"Today is {date.today().isoformat()}. Here is your squad status:\n\n"
        f"{squad_block}\n\n"
        f"Write the morning briefing."
    )

    # ── 4. Call LLM ──────────────────────────────────────────────────────────
    try:
        client = LLMClient()
        resp = await run_in_threadpool(
            client.chat_completions,
            system=system_prompt,
            user=user_prompt,
        )
        summary_text = resp.content.strip()
    except Exception as exc:
        logger.exception("[COA-102] LLM digest generation failed for coach %s", coach_id[:8])
        raise HTTPException(status_code=502, detail=f"AI digest generation failed: {exc}") from exc

    # ── 5. Persist + return ───────────────────────────────────────────────────
    digest: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary_text,
        "athlete_flags": flagged_athletes,
    }

    try:
        supabase.table("coaches").update({"daily_digest": digest}).eq("id", coach_id).execute()
    except Exception as exc:
        logger.warning("[COA-102] Failed to cache digest for coach %s: %s", coach_id[:8], exc)
        # Return the digest anyway — don't fail just because caching failed

    logger.info(
        "[COA-102] Digest generated for coach=%s athletes=%d flags=%d",
        coach_id[:8], len(athletes), len(flagged_athletes),
    )
    return {"coach_id": coach_id, "digest": digest, "regenerated": True}


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


# ── COA-79: Coach onboarding — AI profile generation ──────────────────────────

class GenerateProfileRequest(_BaseModel):
    description: str = Field(
        ...,
        min_length=20,
        max_length=8000,
        description="Free-text coach philosophy / methodology — the AI turns this into a playbook.",
    )
    sport: str | None = Field(
        default=None,
        description="Primary sport (e.g. triathlon, running, cycling). Optional but improves output.",
    )


class GenerateProfileResponse(_BaseModel):
    playbook: dict
    persona_system_prompt: str
    confidence: float
    status: str
    warnings: list[str] = Field(default_factory=list)


@router.post("/onboarding/generate-profile", response_model=GenerateProfileResponse)
async def generate_coach_profile(
    body: GenerateProfileRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-79: Generate a methodology playbook + persona prompt from free-text.

    Preview only — no data is written to the database.
    The coach reviews the generated profile, edits if needed, then calls
    confirm-profile to persist.
    """
    from app.services.methodology_extractor import (
        MethodologyExtractor,
        MethodologyExtractionRequest,
    )
    from app.api.methodology import _build_persona_system_prompt
    from starlette.concurrency import run_in_threadpool

    extractor = MethodologyExtractor()
    extraction_request = MethodologyExtractionRequest(
        transcript=body.description,
        sport=body.sport,
    )

    try:
        result = await run_in_threadpool(extractor.extract, extraction_request)
    except Exception as exc:
        logger.exception("[COA-79] Profile generation failed")
        raise HTTPException(status_code=502, detail=f"Profile generation failed: {exc}") from exc

    persona_system_prompt = _build_persona_system_prompt(result.playbook)

    logger.info(
        "[COA-79] Profile preview generated: coach=%s status=%s confidence=%.2f",
        str(resolve_coach_scope(principal).coach_id)[:8],
        result.status,
        float(result.playbook.get("confidence", 0.0)),
    )

    return GenerateProfileResponse(
        playbook=result.playbook,
        persona_system_prompt=persona_system_prompt,
        confidence=float(result.playbook.get("confidence", 0.0)),
        status=result.status,
        warnings=result.warnings,
    )


class ConfirmProfileRequest(_BaseModel):
    playbook: dict = Field(..., description="The finalized methodology playbook (may be coach-edited).")
    persona_system_prompt: str = Field(
        ...,
        min_length=10,
        max_length=4000,
        description="The persona prompt that controls the AI's voice when responding to athletes.",
    )
    source_description: str = Field(
        default="",
        description="Original free-text the coach submitted (stored as source_transcript for audit).",
    )


@router.post("/onboarding/confirm-profile")
async def confirm_coach_profile(
    body: ConfirmProfileRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-79: Persist the confirmed coach methodology profile.

    Writes to:
    - methodologies table: full playbook + persona_system_prompt + source_transcript
    - coaches table: methodology_playbook + methodology_updated_at
    """
    from app.services.methodology_extractor import persist_methodology_extraction
    from starlette.concurrency import run_in_threadpool

    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    coach_id = str(scope.coach_id)
    settings = get_settings()

    try:
        persisted = await run_in_threadpool(
            persist_methodology_extraction,
            coach_id,
            body.playbook,
            body.persona_system_prompt,
            body.source_description or "(coach onboarding)",
            settings,
            organization_id=str(scope.organization_id) if scope.organization_id else None,
        )
    except Exception as exc:
        logger.exception("[COA-79] Profile confirm failed for coach %s", coach_id[:8])
        raise HTTPException(status_code=502, detail=f"Failed to save profile: {exc}") from exc

    methodology_id = (persisted.get("methodology_row") or {}).get("id")
    logger.info(
        "[COA-79] Profile confirmed and persisted: coach=%s methodology_id=%s",
        coach_id[:8],
        methodology_id or "unknown",
    )

    return {
        "confirmed": True,
        "coach_id": coach_id,
        "methodology_id": methodology_id,
    }


# ── COA-104: Weekly coach digest ───────────────────────────────────────────────

class WeeklyDigestUpdateRequest(_BaseModel):
    summary_text: str = Field(..., min_length=1, max_length=4000)


def _last_sunday(reference: date | None = None) -> date:
    """Return the most recent Sunday on or before reference (defaults to today)."""
    d = reference or date.today()
    # weekday(): Mon=0 … Sun=6
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


@router.get("/weekly-digests")
async def list_weekly_digests(
    request: Request,
    status: str | None = None,
    principal=Depends(require_roles("coach")),
):
    """COA-104: List weekly digests for this coach.

    Optional ?status=draft|sent|dismissed filter.
    Returns digests ordered by week_ending DESC (most recent first).
    """
    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    query = (
        supabase.table("weekly_digests")
        .select(
            "id, athlete_id, week_ending, summary_text, status, sent_at, created_at, updated_at, "
            "athletes(full_name, display_name)"
        )
        .eq("coach_id", coach_id)
        .order("week_ending", desc=True)
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("status", status)

    result = query.execute()
    return {"coach_id": coach_id, "digests": result.data or []}


@router.post("/weekly-digests/generate")
async def generate_weekly_digests(
    request: Request,
    force: bool = False,
    week_ending: str | None = None,
    principal=Depends(require_roles("coach")),
):
    """COA-104: Generate per-athlete weekly digest summaries for this coach.

    Generates one draft summary per active athlete using:
    - Workouts completed vs planned in the past 7 days
    - Biometric trend vs 30-day baseline (COA-101)
    - Morning pulse session summaries if available (COA-103)
    - Upcoming week's focus
    - Weeks-to-race countdown from stable_profile.race_date

    Skips athletes that already have a non-dismissed digest for this week
    unless force=True.

    Returns: {generated: int, skipped: int, digests: [...]}
    """
    from asyncio import get_event_loop
    from starlette.concurrency import run_in_threadpool

    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    # Determine week_ending (most recent Sunday)
    if week_ending:
        try:
            target_week = date.fromisoformat(week_ending)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="week_ending must be YYYY-MM-DD") from exc
    else:
        target_week = _last_sunday()

    week_start = target_week - timedelta(days=6)

    # Fetch coach profile
    coach_row = supabase.table("coaches").select(
        "id, full_name, persona_system_prompt, methodology_playbook"
    ).eq("id", coach_id).single().execute()
    coach = coach_row.data
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")

    persona = (coach.get("persona_system_prompt") or "").strip()
    playbook = coach.get("methodology_playbook") or {}

    # Fetch all active athletes
    athletes_row = supabase.table("athletes").select(
        "id, full_name, display_name, current_state, stable_profile"
    ).eq("coach_id", coach_id).is_("deleted_at", None).execute()
    athletes = athletes_row.data or []

    if not athletes:
        return {"coach_id": coach_id, "generated": 0, "skipped": 0, "digests": []}

    athlete_ids = [a["id"] for a in athletes]

    # Fetch existing digests for this week (to skip if force=False)
    existing_row = supabase.table("weekly_digests").select("athlete_id, status").eq(
        "coach_id", coach_id
    ).eq("week_ending", target_week.isoformat()).execute()
    existing_map: dict[str, str] = {
        r["athlete_id"]: r["status"] for r in (existing_row.data or [])
    }

    # Fetch workouts for the week
    workouts_row = supabase.table("workouts").select(
        "athlete_id, session_type, scheduled_date, status, duration_min, distance_km"
    ).in_("athlete_id", athlete_ids).gte(
        "scheduled_date", week_start.isoformat()
    ).lte("scheduled_date", target_week.isoformat()).execute()
    workouts_by_athlete: dict[str, list] = {}
    for w in (workouts_row.data or []):
        workouts_by_athlete.setdefault(w["athlete_id"], []).append(w)

    # Fetch biometric snapshots (last 35 days for baseline)
    baseline_start = (target_week - timedelta(days=35)).isoformat()
    snapshots_row = supabase.table("biometric_snapshots").select(
        "athlete_id, snapshot_date, readiness, hrv, sleep"
    ).in_("athlete_id", athlete_ids).gte(
        "snapshot_date", baseline_start
    ).lte("snapshot_date", target_week.isoformat()).execute()
    snapshots_by_athlete: dict[str, list] = {}
    for s in (snapshots_row.data or []):
        snapshots_by_athlete.setdefault(s["athlete_id"], []).append(s)

    # Fetch morning pulse sessions for the week
    pulse_row = supabase.table("morning_pulse_sessions").select(
        "athlete_id, session_date, summary_text, completed"
    ).in_("athlete_id", athlete_ids).gte(
        "session_date", week_start.isoformat()
    ).lte("session_date", target_week.isoformat()).eq("completed", True).execute()
    pulse_by_athlete: dict[str, list] = {}
    for p in (pulse_row.data or []):
        pulse_by_athlete.setdefault(p["athlete_id"], []).append(p)

    from app.services.llm_client import LLMClient
    llm = LLMClient()
    generated = 0
    skipped = 0
    result_digests = []

    for athlete in athletes:
        aid = athlete["id"]
        existing_status = existing_map.get(aid)

        # Skip if already has a non-dismissed digest and not forcing
        if existing_status in ("draft", "sent") and not force:
            skipped += 1
            continue

        name = athlete.get("display_name") or athlete.get("full_name") or "Athlete"
        stable = athlete.get("stable_profile") or {}
        current = athlete.get("current_state") or {}

        # Workout summary
        workouts = workouts_by_athlete.get(aid, [])
        planned = len(workouts)
        completed = sum(1 for w in workouts if w.get("status") == "completed")
        missed = sum(1 for w in workouts if (
            w.get("status") not in ("completed", "planned")
            and w.get("scheduled_date", "") < date.today().isoformat()
        ))
        workout_types = list({w.get("session_type", "workout") for w in workouts})
        workout_summary = (
            f"{completed}/{planned} sessions completed"
            + (f" ({missed} missed)" if missed else "")
            + (f" — {', '.join(workout_types[:3])}" if workout_types else "")
        ) if planned else "No workouts scheduled this week"

        # Biometric trend
        snaps = snapshots_by_athlete.get(aid, [])
        this_week_snaps = [s for s in snaps if s["snapshot_date"] >= week_start.isoformat()]
        baseline_snaps = [s for s in snaps if s["snapshot_date"] < week_start.isoformat()]

        def avg(lst, key):
            vals = [x[key] for x in lst if x.get(key) is not None]
            return round(sum(vals) / len(vals), 1) if vals else None

        bio_lines = []
        for metric, label in [("readiness", "Readiness"), ("hrv", "HRV"), ("sleep", "Sleep")]:
            w_avg = avg(this_week_snaps, metric)
            b_avg = avg(baseline_snaps, metric)
            if w_avg is not None and b_avg and b_avg > 0:
                pct = round((w_avg - b_avg) / b_avg * 100)
                direction = "▲" if pct >= 0 else "▼"
                bio_lines.append(f"{label}: {w_avg} ({direction}{abs(pct)}% vs 30-day avg)")
            elif w_avg is not None:
                bio_lines.append(f"{label}: {w_avg}")
        bio_summary = "; ".join(bio_lines) if bio_lines else "No biometric data this week"

        # Pulse check-in themes
        pulses = pulse_by_athlete.get(aid, [])
        pulse_themes = " | ".join(
            p["summary_text"] for p in pulses if p.get("summary_text")
        ) or "No morning pulse data"

        # Race countdown
        race_date_str = stable.get("race_date") or current.get("race_date")
        race_countdown = ""
        if race_date_str:
            try:
                race_dt = date.fromisoformat(str(race_date_str)[:10])
                weeks_out = max(0, (race_dt - target_week).days // 7)
                race_name = stable.get("target_race") or current.get("target_race") or "target race"
                race_countdown = f"{weeks_out} weeks to {race_name} ({race_dt.strftime('%b %d')})"
            except (ValueError, TypeError):
                pass

        # Build LLM prompt
        system_prompt = persona or (
            "You are a high-performance endurance sports coach. "
            "Write in a direct, encouraging, professional tone."
        )

        user_prompt = f"""Write a weekly training summary for athlete {name}.

Week: {week_start.strftime('%b %d')} – {target_week.strftime('%b %d, %Y')}
{f'Race countdown: {race_countdown}' if race_countdown else ''}

Training this week:
{workout_summary}

Biometric trends:
{bio_summary}

Morning check-in themes:
{pulse_themes}

Instructions:
- 3–4 sentences maximum
- Acknowledge what went well
- Note any concern if biometrics are down >15% or sessions were missed
- Preview next week's focus briefly
- Write in my (the coach's) voice as if I'm messaging directly to {name}
- Do NOT include generic AI language or sign-off — I will send this myself"""

        try:
            response = await run_in_threadpool(
                llm.complete,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=300,
            )
            summary_text = response.content.strip()
        except Exception as exc:
            logger.warning("[COA-104] LLM failed for athlete %s: %s", aid[:8], exc)
            # Fallback: build a minimal text summary without AI
            summary_text = (
                f"{name} — week of {week_start.strftime('%b %d')}: "
                f"{workout_summary}. {bio_summary}."
                + (f" {race_countdown}." if race_countdown else "")
            )

        # Upsert into weekly_digests
        try:
            upsert_data = {
                "coach_id": coach_id,
                "athlete_id": aid,
                "week_ending": target_week.isoformat(),
                "summary_text": summary_text,
                "status": "draft",
            }
            upserted = supabase.table("weekly_digests").upsert(
                upsert_data,
                on_conflict="athlete_id,week_ending",
            ).execute()
            digest_row = (upserted.data or [{}])[0]
        except Exception as exc:
            logger.error("[COA-104] Failed to upsert digest for athlete %s: %s", aid[:8], exc)
            digest_row = {**upsert_data, "id": None}

        result_digests.append({
            **digest_row,
            "athlete_name": name,
        })
        generated += 1

    logger.info(
        "[COA-104] Weekly digest batch: coach=%s generated=%d skipped=%d week=%s",
        coach_id[:8], generated, skipped, target_week.isoformat(),
    )
    return {
        "coach_id": coach_id,
        "week_ending": target_week.isoformat(),
        "generated": generated,
        "skipped": skipped,
        "digests": result_digests,
    }


@router.patch("/weekly-digests/{digest_id}")
async def update_weekly_digest(
    digest_id: str,
    body: WeeklyDigestUpdateRequest,
    request: Request,
    principal=Depends(require_roles("coach")),
):
    """COA-104: Update the summary_text of a draft weekly digest (inline edit before send)."""
    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    existing = supabase.table("weekly_digests").select("id, status, coach_id").eq(
        "id", digest_id
    ).single().execute()
    row = existing.data
    if not row:
        raise HTTPException(status_code=404, detail="Digest not found")
    if row["coach_id"] != coach_id:
        raise HTTPException(status_code=403, detail="Not your digest")
    if row["status"] == "sent":
        raise HTTPException(status_code=400, detail="Cannot edit a digest that has already been sent")

    updated = supabase.table("weekly_digests").update({
        "summary_text": body.summary_text.strip(),
    }).eq("id", digest_id).execute()

    return {"updated": True, "digest": (updated.data or [{}])[0]}


@router.post("/weekly-digests/{digest_id}/send")
async def send_weekly_digest(
    digest_id: str,
    request: Request,
    principal=Depends(require_roles("coach")),
):
    """COA-104: Send a weekly digest to the athlete via WhatsApp and mark it sent."""
    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    # Fetch digest + athlete phone
    digest_row = supabase.table("weekly_digests").select(
        "id, athlete_id, summary_text, status, coach_id, week_ending"
    ).eq("id", digest_id).single().execute()
    digest = digest_row.data
    if not digest:
        raise HTTPException(status_code=404, detail="Digest not found")
    if digest["coach_id"] != coach_id:
        raise HTTPException(status_code=403, detail="Not your digest")
    if digest["status"] == "sent":
        raise HTTPException(status_code=400, detail="Digest already sent")

    athlete_row = supabase.table("athletes").select(
        "id, full_name, display_name, whatsapp_number"
    ).eq("id", digest["athlete_id"]).single().execute()
    athlete = athlete_row.data
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    phone = athlete.get("whatsapp_number")
    if not phone:
        raise HTTPException(status_code=422, detail="Athlete has no WhatsApp number")

    name = athlete.get("display_name") or athlete.get("full_name") or "Athlete"
    week_end = digest.get("week_ending", "")
    try:
        week_label = date.fromisoformat(week_end).strftime("week of %b %d")
    except (ValueError, TypeError):
        week_label = f"week of {week_end}"

    message = (
        f"📊 Your weekly summary — {week_label}:\n\n"
        f"{digest['summary_text']}"
    )

    # Use existing WhatsApp send utility
    try:
        from app.services.whatsapp_service import send_whatsapp_message
        await send_whatsapp_message(phone, message)
    except Exception as exc:
        logger.error("[COA-104] WhatsApp send failed for digest %s: %s", digest_id[:8], exc)
        raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {exc}") from exc

    # Mark as sent
    supabase.table("weekly_digests").update({
        "status": "sent",
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", digest_id).execute()

    logger.info("[COA-104] Weekly digest sent: digest=%s athlete=%s", digest_id[:8], athlete["id"][:8])
    return {"sent": True, "athlete": name, "digest_id": digest_id}


@router.post("/weekly-digests/{digest_id}/dismiss")
async def dismiss_weekly_digest(
    digest_id: str,
    request: Request,
    principal=Depends(require_roles("coach")),
):
    """COA-104: Dismiss a weekly digest without sending it."""
    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    row = supabase.table("weekly_digests").select("id, coach_id, status").eq(
        "id", digest_id
    ).single().execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Digest not found")
    if row["coach_id"] != coach_id:
        raise HTTPException(status_code=403, detail="Not your digest")

    supabase.table("weekly_digests").update({"status": "dismissed"}).eq("id", digest_id).execute()
    return {"dismissed": True, "digest_id": digest_id}


# ── COA-106: Coach session notes ───────────────────────────────────────────────

class SessionNoteRequest(_BaseModel):
    note_text: str = Field(..., min_length=1, max_length=2000)
    workout_id: str | None = Field(default=None)


@router.post("/athletes/{athlete_id}/notes/draft")
async def draft_session_note(
    athlete_id: str,
    request: Request,
    workout_id: str | None = None,
    principal=Depends(require_roles("coach")),
):
    """COA-106: AI-draft a post-workout session note for this athlete.

    Uses the most recent completed workout (or the specified workout_id),
    biometric data from current_state, and the coach's persona_system_prompt
    to generate a note in the coach's voice. Under 3 sentences.
    """
    from starlette.concurrency import run_in_threadpool
    from app.services.llm_client import LLMClient

    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    # Fetch coach persona
    coach_row = supabase.table("coaches").select(
        "id, full_name, persona_system_prompt"
    ).eq("id", coach_id).single().execute()
    coach = coach_row.data or {}
    persona = (coach.get("persona_system_prompt") or "").strip()

    # Fetch athlete
    athlete_row = supabase.table("athletes").select(
        "id, full_name, display_name, current_state, stable_profile, coach_id"
    ).eq("id", athlete_id).single().execute()
    athlete = athlete_row.data
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if athlete["coach_id"] != coach_id:
        raise HTTPException(status_code=403, detail="Not your athlete")

    name = athlete.get("display_name") or athlete.get("full_name") or "Athlete"
    cs = athlete.get("current_state") or {}
    sp = athlete.get("stable_profile") or {}

    # Fetch target workout
    if workout_id:
        wq = supabase.table("workouts").select(
            "id, session_type, title, duration_min, distance_km, hr_zone, status, scheduled_date"
        ).eq("id", workout_id).single().execute()
        workout = wq.data
    else:
        # Most recent completed workout
        wq = supabase.table("workouts").select(
            "id, session_type, title, duration_min, distance_km, hr_zone, status, scheduled_date"
        ).eq("athlete_id", athlete_id).eq("status", "completed").order(
            "scheduled_date", desc=True
        ).limit(1).execute()
        workout = (wq.data or [None])[0]

    # Build workout line
    if workout:
        wtype = workout.get("session_type", "workout")
        wdur = workout.get("duration_min")
        wdist = workout.get("distance_km")
        wtitle = workout.get("title") or wtype
        workout_line = f"{wtitle}"
        if wdur: workout_line += f" ({wdur} min"
        if wdist: workout_line += f", {wdist} km"
        if wdur or wdist: workout_line += ")"
        workout_status = workout.get("status", "completed")
    else:
        workout_line = "recent training session"
        workout_status = "completed"

    # Biometrics
    readiness = cs.get("oura_readiness_score") or cs.get("last_readiness_score")
    hrv = cs.get("oura_avg_hrv") or cs.get("last_hrv")
    bio_line = ""
    if readiness: bio_line += f"Readiness {readiness}"
    if hrv: bio_line += f"{', ' if bio_line else ''}HRV {hrv}"
    if not bio_line: bio_line = "No biometric data today"

    # Race context
    race_date = sp.get("race_date") or cs.get("race_date")
    race_name = sp.get("target_race") or cs.get("target_race")
    race_line = ""
    if race_date and race_name:
        try:
            rd = date.fromisoformat(str(race_date)[:10])
            weeks = max(0, (rd - date.today()).days // 7)
            race_line = f"({weeks} weeks to {race_name})"
        except (ValueError, TypeError):
            pass

    system_prompt = persona or (
        "You are a high-performance endurance sports coach. "
        "Write short, specific, encouraging post-workout notes directly to your athlete."
    )
    user_prompt = f"""Write a brief post-workout note for {name} about their {workout_line}.

Athlete biometrics today: {bio_line}
{f'Race context: {race_line}' if race_line else ''}

Instructions:
- Maximum 3 sentences
- Acknowledge what they did specifically
- Note anything about their biometrics if relevant
- Preview or encourage for next session
- Write directly to the athlete (use "you")
- Do NOT include a sign-off or greeting — the coach will send this themselves"""

    try:
        llm = LLMClient()
        resp = await run_in_threadpool(
            llm.complete,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=200,
        )
        note_text = resp.content.strip()
    except Exception as exc:
        logger.warning("[COA-106] LLM draft failed for athlete %s: %s", athlete_id[:8], exc)
        note_text = f"Great work on your {workout_line}, {name}. Keep that momentum going!"

    return {
        "draft": note_text,
        "athlete_id": athlete_id,
        "workout_id": workout_id or (workout or {}).get("id"),
    }


@router.post("/athletes/{athlete_id}/notes")
async def save_session_note(
    athlete_id: str,
    body: SessionNoteRequest,
    request: Request,
    send: bool = False,
    principal=Depends(require_roles("coach")),
):
    """COA-106: Save a session note (manual or AI-drafted).

    If ?send=true, also fires the note to the athlete via WhatsApp and sets
    sent_via_whatsapp=true.
    """
    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    # Validate athlete belongs to coach
    athlete_row = supabase.table("athletes").select(
        "id, full_name, display_name, whatsapp_number, coach_id"
    ).eq("id", athlete_id).single().execute()
    athlete = athlete_row.data
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if athlete["coach_id"] != coach_id:
        raise HTTPException(status_code=403, detail="Not your athlete")

    sent_via_whatsapp = False
    sent_at = None

    if send:
        phone = athlete.get("whatsapp_number")
        if not phone:
            raise HTTPException(status_code=422, detail="Athlete has no WhatsApp number")
        try:
            from app.services.whatsapp_service import send_whatsapp_message
            await send_whatsapp_message(phone, body.note_text.strip())
            sent_via_whatsapp = True
            sent_at = datetime.now(timezone.utc).isoformat()
        except Exception as exc:
            logger.error("[COA-106] WhatsApp send failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {exc}") from exc

    result = supabase.table("coach_notes").insert({
        "coach_id": coach_id,
        "athlete_id": athlete_id,
        "note_text": body.note_text.strip(),
        "source": "manual",
        "workout_id": body.workout_id,
        "sent_via_whatsapp": sent_via_whatsapp,
        "sent_at": sent_at,
    }).execute()

    note = (result.data or [{}])[0]
    logger.info("[COA-106] Note saved: coach=%s athlete=%s sent=%s", coach_id[:8], athlete_id[:8], sent_via_whatsapp)
    return {"saved": True, "sent": sent_via_whatsapp, "note": note}


@router.get("/athletes/{athlete_id}/notes")
async def list_session_notes(
    athlete_id: str,
    request: Request,
    limit: int = 20,
    principal=Depends(require_roles("coach")),
):
    """COA-106: List session notes for an athlete (newest first)."""
    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    # Validate ownership
    athlete_row = supabase.table("athletes").select("id, coach_id").eq("id", athlete_id).single().execute()
    athlete = athlete_row.data
    if not athlete or athlete["coach_id"] != coach_id:
        raise HTTPException(status_code=403, detail="Not your athlete")

    notes_row = supabase.table("coach_notes").select(
        "id, note_text, source, sent_via_whatsapp, sent_at, workout_id, created_at"
    ).eq("athlete_id", athlete_id).eq("coach_id", coach_id).order(
        "created_at", desc=True
    ).limit(limit).execute()

    return {"athlete_id": athlete_id, "notes": notes_row.data or []}


@router.post("/athletes/{athlete_id}/notes/{note_id}/send")
async def send_session_note(
    athlete_id: str,
    note_id: str,
    request: Request,
    principal=Depends(require_roles("coach")),
):
    """COA-106: Send an existing saved note to the athlete via WhatsApp."""
    supabase = request.app.state.supabase
    coach_id = principal["coach_id"]

    note_row = supabase.table("coach_notes").select(
        "id, note_text, coach_id, sent_via_whatsapp"
    ).eq("id", note_id).eq("athlete_id", athlete_id).single().execute()
    note = note_row.data
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note["coach_id"] != coach_id:
        raise HTTPException(status_code=403, detail="Not your note")
    if note["sent_via_whatsapp"]:
        raise HTTPException(status_code=400, detail="Note already sent")

    athlete_row = supabase.table("athletes").select(
        "full_name, display_name, whatsapp_number, coach_id"
    ).eq("id", athlete_id).single().execute()
    athlete = athlete_row.data
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    phone = athlete.get("whatsapp_number")
    if not phone:
        raise HTTPException(status_code=422, detail="Athlete has no WhatsApp number")

    try:
        from app.services.whatsapp_service import send_whatsapp_message
        await send_whatsapp_message(phone, note["note_text"])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {exc}") from exc

    supabase.table("coach_notes").update({
        "sent_via_whatsapp": True,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "source": "ai_sent" if note.get("source") == "ai_draft" else "manual",
    }).eq("id", note_id).execute()

    return {"sent": True, "note_id": note_id}
