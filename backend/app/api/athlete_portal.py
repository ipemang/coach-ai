"""COA-74: Athlete self-service portal API.

Token-authenticated endpoints — no Supabase auth required.
All routes validate the `token` param against `athlete_connect_tokens`
with purpose='plan_access', extract athlete_id, and scope all queries to that athlete.

Routes:
    GET  /athlete/profile                  → name, wearable connection status
    GET  /athlete/plan                     → this week's workouts
    POST /athlete/workout/{id}/complete    → mark workout done + log
    POST /athlete/checkin                  → submit a check-in
    GET  /athlete/messages                 → recent coach reply thread
    GET  /athlete/checkins                 → recent check-in history
    POST /athlete/oura-token               → save Oura Personal Access Token
"""
from __future__ import annotations

import inspect
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.services.scope import DataScope, apply_scope_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/athlete", tags=["athlete-portal"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _qr(query: Any) -> list[dict[str, Any]]:
    if hasattr(query, "execute"):
        result = query.execute()
        response = await result if inspect.isawaitable(result) else result
    else:
        response = await query if inspect.isawaitable(query) else query
    if response is None:
        return []
    data = getattr(response, "data", response)
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        return [data]
    return []


async def _resolve_token(supabase: Any, token: str) -> dict[str, Any]:
    """Validate plan_access token → return athlete row. Raises 401/404 on failure."""
    rows = await _qr(
        supabase.table("athlete_connect_tokens")
        .select("athlete_id, expires_at, purpose")
        .eq("token", token)
        .eq("purpose", "plan_access")
        .limit(1)
    )
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid or expired access link")

    row = rows[0]
    expires_at = row.get("expires_at")
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if exp < datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=401,
                    detail="Access link has expired — ask your coach to resend it",
                )
        except ValueError:
            pass

    athlete_id = row.get("athlete_id")
    if not athlete_id:
        raise HTTPException(status_code=401, detail="Invalid access link")

    athlete_rows = await _qr(
        supabase.table("athletes")
        .select("id, full_name, coach_id, organization_id, phone_number, stable_profile, current_state")
        .eq("id", athlete_id)
        .limit(1)
    )
    if not athlete_rows:
        raise HTTPException(status_code=404, detail="Athlete not found")

    return athlete_rows[0]


def _scope(athlete: dict) -> DataScope:
    return DataScope(
        organization_id=str(athlete.get("organization_id") or ""),
        coach_id=str(athlete.get("coach_id") or ""),
    )


def _week_bounds() -> tuple[date, date]:
    today = date.today()
    start = today - timedelta(days=today.weekday())  # Monday
    return start, start + timedelta(days=6)


# ---------------------------------------------------------------------------
# GET /athlete/profile
# ---------------------------------------------------------------------------

@router.get("/profile")
async def athlete_profile(token: str = Query(...), request: Request = None):  # type: ignore
    supabase = request.app.state.supabase_client
    athlete = await _resolve_token(supabase, token)
    athlete_id = athlete["id"]

    strava_rows = await _qr(
        supabase.table("strava_tokens").select("id").eq("athlete_id", athlete_id).limit(1)
    )
    oura_rows = await _qr(
        supabase.table("oura_tokens").select("id").eq("athlete_id", athlete_id).limit(1)
    )

    sp = athlete.get("stable_profile") or {}
    cs = athlete.get("current_state") or {}

    return {
        "athlete_id": athlete_id,
        "full_name": athlete.get("full_name"),
        "target_race": sp.get("target_race"),
        "race_date": sp.get("race_date"),
        "strava_connected": bool(strava_rows),
        "oura_connected": bool(oura_rows),
        "readiness": cs.get("oura_readiness_score") or cs.get("last_readiness_score"),
        "hrv": cs.get("oura_avg_hrv") or cs.get("last_hrv"),
    }


# ---------------------------------------------------------------------------
# GET /athlete/plan
# ---------------------------------------------------------------------------

@router.get("/plan")
async def athlete_plan(token: str = Query(...), request: Request = None):  # type: ignore
    supabase = request.app.state.supabase_client
    athlete = await _resolve_token(supabase, token)
    athlete_id = athlete["id"]

    week_start, week_end = _week_bounds()
    today = date.today()
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    workouts = await _qr(
        supabase.table("workouts")
        .select(
            "id, scheduled_date, session_type, title, duration_min, distance_km, "
            "hr_zone, target_pace, coaching_notes, status, completed_at, source"
        )
        .eq("athlete_id", athlete_id)
        .gte("scheduled_date", week_start.isoformat())
        .lte("scheduled_date", week_end.isoformat())
        .order("scheduled_date", desc=False)
    )

    total_planned = 0
    total_completed = 0
    enriched = []

    for w in workouts:
        try:
            sched = date.fromisoformat(w["scheduled_date"])
        except (KeyError, ValueError):
            continue

        dur = w.get("duration_min") or 0
        total_planned += dur
        status = w.get("status", "pending")

        if status == "completed":
            display_status = "completed"
            total_completed += dur
        elif sched < today:
            display_status = "missed"
        elif sched == today:
            display_status = "today"
        else:
            display_status = "upcoming"

        enriched.append({
            **w,
            "day_label": day_names[sched.weekday()],
            "display_status": display_status,
            "is_today": sched == today,
        })

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "workouts": enriched,
        "summary": {
            "total_planned_min": total_planned,
            "total_completed_min": total_completed,
            "completion_pct": round((total_completed / total_planned * 100) if total_planned else 0),
        },
    }


# ---------------------------------------------------------------------------
# POST /athlete/workout/{workout_id}/complete
# ---------------------------------------------------------------------------

class WorkoutCompleteRequest(BaseModel):
    completed: bool = True
    actual_duration_min: int | None = None
    rpe: int | None = None
    athlete_notes: str | None = None


@router.post("/workout/{workout_id}/complete")
async def complete_workout(
    workout_id: str,
    body: WorkoutCompleteRequest,
    token: str = Query(...),
    request: Request = None,  # type: ignore
):
    supabase = request.app.state.supabase_client
    athlete = await _resolve_token(supabase, token)
    athlete_id = athlete["id"]

    workout_rows = await _qr(
        supabase.table("workouts")
        .select("id, session_type, scheduled_date, duration_min")
        .eq("id", workout_id)
        .eq("athlete_id", athlete_id)
        .limit(1)
    )
    if not workout_rows:
        raise HTTPException(status_code=404, detail="Workout not found")

    workout = workout_rows[0]
    new_status = "completed" if body.completed else "missed"

    update: dict[str, Any] = {"status": new_status}
    if body.completed:
        update["completed_at"] = datetime.now(timezone.utc).isoformat()
    if body.actual_duration_min is not None:
        update["actual_duration_min"] = body.actual_duration_min
    if body.rpe is not None:
        update["rpe"] = max(1, min(10, body.rpe))
    if body.athlete_notes:
        update["athlete_notes"] = body.athlete_notes

    supabase.table("workouts").update(update).eq("id", workout_id).execute()

    # Notify coach via check-in if athlete added notes
    if body.completed and (body.athlete_notes or body.rpe):
        dur = body.actual_duration_min or workout.get("duration_min", "?")
        checkin_text = f"Completed {workout.get('session_type', 'workout')} ({dur} min)"
        if body.rpe:
            checkin_text += f" — RPE {body.rpe}/10"
        if body.athlete_notes:
            checkin_text += f". {body.athlete_notes}"

        try:
            supabase.table("athlete_checkins").insert(
                apply_scope_payload({
                    "athlete_id": athlete_id,
                    "coach_id": athlete.get("coach_id"),
                    "message_text": checkin_text,
                    "message_type": "workout_log",
                    "processed": False,
                }, _scope(athlete))
            ).execute()
        except Exception as exc:
            logger.warning("[athlete-portal] Failed to create check-in from workout log: %s", exc)

    logger.info("[athlete-portal] Workout %s → %s (athlete=%s)", workout_id, new_status, athlete_id)
    return {"ok": True, "workout_id": workout_id, "status": new_status}


# ---------------------------------------------------------------------------
# POST /athlete/checkin
# ---------------------------------------------------------------------------

class CheckInRequest(BaseModel):
    readiness: int
    soreness: int
    notes: str | None = None


@router.post("/checkin")
async def athlete_checkin(
    body: CheckInRequest,
    token: str = Query(...),
    request: Request = None,  # type: ignore
):
    supabase = request.app.state.supabase_client
    athlete = await _resolve_token(supabase, token)
    athlete_id = athlete["id"]
    coach_id = athlete.get("coach_id")

    readiness = max(1, min(10, body.readiness))
    soreness = max(1, min(10, body.soreness))

    parts = [f"Readiness: {readiness}/10", f"Soreness: {soreness}/10"]
    if body.notes:
        parts.append(body.notes)
    message_text = " | ".join(parts)

    checkin_res = supabase.table("athlete_checkins").insert(
        apply_scope_payload({
            "athlete_id": athlete_id,
            "coach_id": coach_id,
            "message_text": message_text,
            "message_type": "portal_checkin",
            "processed": False,
        }, _scope(athlete))
    ).execute()
    checkin_id = checkin_res.data[0].get("id") if checkin_res.data else None

    # Create pending suggestion so coach sees it in the dashboard
    suggestion_id = None
    try:
        suggestion_res = supabase.table("suggestions").insert(
            apply_scope_payload({
                "athlete_id": athlete_id,
                "coach_id": coach_id,
                "athlete_display_name": athlete.get("full_name"),
                "athlete_phone_number": athlete.get("phone_number"),
                "suggestion_text": f"Portal check-in from {athlete.get('full_name')}: {message_text}",
                "athlete_message": message_text,
                "status": "pending",
                "source": "portal_checkin",
                "message_class": "check_in",
            }, _scope(athlete))
        ).execute()
        suggestion_id = suggestion_res.data[0].get("id") if suggestion_res.data else None
        if checkin_id and suggestion_id:
            supabase.table("athlete_checkins").update({
                "suggestion_id": suggestion_id,
                "processed": True,
            }).eq("id", checkin_id).execute()
    except Exception as exc:
        logger.warning("[athlete-portal] Failed to create suggestion from check-in: %s", exc)

    logger.info("[athlete-portal] Check-in from athlete=%s readiness=%d soreness=%d", athlete_id, readiness, soreness)
    return {"ok": True, "checkin_id": checkin_id, "suggestion_id": suggestion_id}


# ---------------------------------------------------------------------------
# GET /athlete/messages
# ---------------------------------------------------------------------------

@router.get("/messages")
async def athlete_messages(token: str = Query(...), request: Request = None):  # type: ignore
    supabase = request.app.state.supabase_client
    athlete = await _resolve_token(supabase, token)

    rows = await _qr(
        supabase.table("suggestions")
        .select("id, athlete_message, suggestion_text, coach_reply, message_personalized, status, created_at")
        .eq("athlete_id", athlete["id"])
        .in_("status", ["approved", "sent", "completed"])
        .order("created_at", desc=True)
        .limit(10)
    )

    thread = []
    for s in rows:
        coach_msg = (
            s.get("coach_reply")
            or s.get("message_personalized")
            or s.get("suggestion_text")
            or ""
        )
        if not coach_msg:
            continue
        thread.append({
            "id": s["id"],
            "athlete_message": s.get("athlete_message"),
            "coach_reply": coach_msg,
            "created_at": s.get("created_at"),
        })

    return {"messages": thread}


# ---------------------------------------------------------------------------
# GET /athlete/checkins
# ---------------------------------------------------------------------------

@router.get("/checkins")
async def athlete_checkins_history(token: str = Query(...), request: Request = None):  # type: ignore
    supabase = request.app.state.supabase_client
    athlete = await _resolve_token(supabase, token)

    rows = await _qr(
        supabase.table("athlete_checkins")
        .select("id, message_text, message_type, created_at")
        .eq("athlete_id", athlete["id"])
        .order("created_at", desc=True)
        .limit(5)
    )
    return {"checkins": rows}


# ---------------------------------------------------------------------------
# POST /athlete/oura-token
# ---------------------------------------------------------------------------

class OuraTokenRequest(BaseModel):
    access_token: str


@router.post("/oura-token")
async def save_oura_token(
    body: OuraTokenRequest,
    token: str = Query(...),
    request: Request = None,  # type: ignore
):
    supabase = request.app.state.supabase_client
    athlete = await _resolve_token(supabase, token)

    supabase.table("oura_tokens").upsert({
        "athlete_id": athlete["id"],
        "access_token": body.access_token.strip(),
    }, on_conflict="athlete_id").execute()

    logger.info("[athlete-portal] Oura token saved for athlete=%s", athlete["id"])
    return {"ok": True, "message": "Oura Ring connected successfully"}


# ── COA-105: Monthly workout calendar ─────────────────────────────────────────

@router.get("/calendar")
async def athlete_calendar(
    token: str = Query(...),
    month: str = Query(None, description="YYYY-MM, defaults to current month"),
    request: Request = None,  # type: ignore
):
    """COA-105: Return all workouts for a calendar month (±1 month buffer on each side).

    Also returns athlete's stable_profile.race_date for race pin on calendar.
    """
    supabase = request.app.state.supabase_client
    athlete = await _resolve_token(supabase, token)
    athlete_id = athlete["id"]

    today = date.today()

    # Parse target month
    if month:
        try:
            y, m = [int(x) for x in month.split("-")]
            target_month = date(y, m, 1)
        except (ValueError, AttributeError) as exc:
            raise HTTPException(status_code=400, detail="month must be YYYY-MM") from exc
    else:
        target_month = date(today.year, today.month, 1)

    # Fetch one month of workouts (just the target month, let JS handle display)
    # Add a 7-day buffer on each side for calendar grid overflow
    range_start = (target_month - timedelta(days=7)).isoformat()
    next_month = date(
        target_month.year + (1 if target_month.month == 12 else 0),
        (target_month.month % 12) + 1,
        1
    )
    range_end = (next_month + timedelta(days=7)).isoformat()

    workouts = await _qr(
        supabase.table("workouts")
        .select(
            "id, scheduled_date, session_type, title, duration_min, distance_km, "
            "hr_zone, target_pace, coaching_notes, status, completed_at"
        )
        .eq("athlete_id", athlete_id)
        .gte("scheduled_date", range_start)
        .lte("scheduled_date", range_end)
        .order("scheduled_date", desc=False)
    )

    # Enrich each workout with display status
    enriched = []
    for w in workouts:
        try:
            sched = date.fromisoformat(w["scheduled_date"])
        except (KeyError, ValueError):
            continue

        status = w.get("status", "pending")
        if status == "completed":
            display_status = "completed"
        elif sched < today:
            display_status = "missed"
        elif sched == today:
            display_status = "today"
        else:
            display_status = "upcoming"

        enriched.append({
            **w,
            "display_status": display_status,
            "is_today": sched == today,
        })

    # Fetch race date from stable_profile
    race_date = None
    race_name = None
    stable = athlete.get("stable_profile") or {}
    current = athlete.get("current_state") or {}
    race_date_raw = stable.get("race_date") or current.get("race_date")
    race_name_raw = stable.get("target_race") or current.get("target_race")
    if race_date_raw:
        try:
            race_date = str(race_date_raw)[:10]  # ensure YYYY-MM-DD
            race_name = race_name_raw
        except (TypeError, ValueError):
            pass

    return {
        "month": target_month.isoformat(),
        "workouts": enriched,
        "race_date": race_date,
        "race_name": race_name,
        "today": today.isoformat(),
    }
