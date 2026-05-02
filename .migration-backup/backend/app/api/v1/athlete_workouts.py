"""COA-116: Athlete workout endpoints — real workouts from DB for the athlete dashboard.

Endpoints (athlete-facing):
  GET    /api/v1/athlete/workouts              — list workouts in a date range
  PATCH  /api/v1/athlete/workouts/{id}/complete — mark workout complete
  PATCH  /api/v1/athlete/workouts/{id}/notes    — save athlete notes/comment

Endpoints (coach-facing):
  GET    /api/v1/coach/athletes/{athlete_id}/workouts  — coach views athlete's workouts
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.security import (
    AuthenticatedPrincipal,
    require_roles,
    resolve_athlete_scope,
    resolve_coach_scope,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["athlete-workouts"])


# ── Response / request models ─────────────────────────────────────────────────

class WorkoutOut(BaseModel):
    id: str
    athlete_id: str
    scheduled_date: str          # YYYY-MM-DD
    session_type: str            # swim | bike | run | strength | brick | rest
    title: Optional[str]
    distance_km: Optional[float]
    duration_min: Optional[float]
    hr_zone: Optional[str]
    target_pace: Optional[str]
    coaching_notes: Optional[str]
    athlete_notes: Optional[str]
    status: str                  # planned | completed | missed | skipped
    compliance_pct: Optional[float]
    actual_duration_min: Optional[float]
    actual_distance_km: Optional[float]
    sent_via_whatsapp: bool
    modification_source: Optional[str]
    created_at: str
    updated_at: str


class CompleteWorkoutRequest(BaseModel):
    actual_duration_min: Optional[float] = None
    actual_distance_km: Optional[float] = None
    perceived_effort: Optional[int] = None   # 1–10 RPE
    notes: Optional[str] = None


class NotesRequest(BaseModel):
    notes: str


def _row_to_workout(row: dict) -> WorkoutOut:
    """Map a DB row to WorkoutOut, computing compliance if possible."""
    planned_dur = row.get("duration_min")
    actual_dur = row.get("actual_duration_min")
    compliance = None
    if planned_dur and actual_dur and float(planned_dur) > 0:
        compliance = round(min(float(actual_dur) / float(planned_dur), 1.0) * 100, 1)

    return WorkoutOut(
        id=str(row["id"]),
        athlete_id=str(row["athlete_id"]),
        scheduled_date=str(row.get("scheduled_date", "")),
        session_type=row.get("session_type") or "other",
        title=row.get("title"),
        distance_km=float(row["distance_km"]) if row.get("distance_km") is not None else None,
        duration_min=float(row["duration_min"]) if row.get("duration_min") is not None else None,
        hr_zone=row.get("hr_zone"),
        target_pace=row.get("target_pace"),
        coaching_notes=row.get("coaching_notes"),
        athlete_notes=row.get("athlete_notes"),
        status=row.get("status") or "planned",
        compliance_pct=compliance,
        actual_duration_min=float(row["actual_duration_min"]) if row.get("actual_duration_min") is not None else None,
        actual_distance_km=float(row["actual_distance_km"]) if row.get("actual_distance_km") is not None else None,
        sent_via_whatsapp=bool(row.get("sent_via_whatsapp", False)),
        modification_source=row.get("modification_source"),
        created_at=str(row.get("created_at", "")),
        updated_at=str(row.get("updated_at", "")),
    )


# ── Athlete endpoints ─────────────────────────────────────────────────────────

@router.get("/api/v1/athlete/workouts", response_model=list[WorkoutOut])
async def list_athlete_workouts(
    from_date: str = Query(..., alias="from", description="Start date YYYY-MM-DD"),
    to_date: str = Query(..., alias="to", description="End date YYYY-MM-DD"),
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "coach")),
):
    """Return all workouts for the authenticated athlete between from and to (inclusive)."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    def _fetch():
        return (
            supabase.table("workouts")
            .select("*")
            .eq("athlete_id", athlete_id)
            .gte("scheduled_date", from_date)
            .lte("scheduled_date", to_date)
            .order("scheduled_date", desc=False)
            .execute()
        )

    try:
        result = await run_in_threadpool(_fetch)
        rows = result.data or []
        return [_row_to_workout(r) for r in rows]
    except Exception as exc:
        logger.exception("[athlete_workouts] list failed for athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load workouts") from exc


@router.patch("/api/v1/athlete/workouts/{workout_id}/complete")
async def complete_workout(
    workout_id: str,
    body: CompleteWorkoutRequest,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Mark a workout as completed. Writes to DB and logs a memory event."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    def _verify_and_update():
        # Verify ownership
        check = (
            supabase.table("workouts")
            .select("id, athlete_id, title, session_type, duration_min")
            .eq("id", workout_id)
            .eq("athlete_id", athlete_id)
            .single()
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Workout not found")

        workout = check.data
        now = datetime.now(timezone.utc).isoformat()

        update_payload: dict = {
            "status": "completed",
            "updated_at": now,
        }
        if body.actual_duration_min is not None:
            update_payload["actual_duration_min"] = body.actual_duration_min
        if body.actual_distance_km is not None:
            update_payload["actual_distance_km"] = body.actual_distance_km
        if body.notes:
            update_payload["athlete_notes"] = body.notes

        supabase.table("workouts").update(update_payload).eq("id", workout_id).execute()

        # Write memory event
        title = workout.get("title") or workout.get("session_type") or "workout"
        planned_dur = workout.get("duration_min")
        actual_dur = body.actual_duration_min
        duration_note = ""
        if actual_dur and planned_dur:
            compliance = round(min(actual_dur / float(planned_dur), 1.0) * 100)
            duration_note = f" ({actual_dur:.0f}/{planned_dur:.0f} min, {compliance}% compliance)"
        elif actual_dur:
            duration_note = f" ({actual_dur:.0f} min)"

        content = f"Completed \"{title}\"{duration_note}."
        if body.perceived_effort:
            content += f" RPE {body.perceived_effort}/10."

        try:
            supabase.table("athlete_memory_events").insert({
                "athlete_id": athlete_id,
                "event_type": "complete",
                "content": content,
                "metadata": {
                    "workout_id": workout_id,
                    "actual_duration_min": body.actual_duration_min,
                    "actual_distance_km": body.actual_distance_km,
                    "perceived_effort": body.perceived_effort,
                },
            }).execute()
        except Exception as mem_exc:
            logger.warning("[athlete_workouts] memory event failed: %s", mem_exc)

        return workout

    try:
        workout = await run_in_threadpool(_verify_and_update)
        return {"status": "completed", "workout_id": workout_id, "title": workout.get("title")}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[athlete_workouts] complete failed workout=%s", workout_id)
        raise HTTPException(status_code=500, detail="Failed to complete workout") from exc


@router.patch("/api/v1/athlete/workouts/{workout_id}/notes")
async def save_workout_notes(
    workout_id: str,
    body: NotesRequest,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Save athlete notes/comment on a specific workout."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    def _save():
        check = (
            supabase.table("workouts")
            .select("id, athlete_id, title")
            .eq("id", workout_id)
            .eq("athlete_id", athlete_id)
            .single()
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Workout not found")

        supabase.table("workouts").update({
            "athlete_notes": body.notes,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", workout_id).execute()

        title = check.data.get("title") or "workout"
        try:
            supabase.table("athlete_memory_events").insert({
                "athlete_id": athlete_id,
                "event_type": "comment",
                "content": f"Note on \"{title}\": {body.notes[:200]}{'…' if len(body.notes) > 200 else ''}",
                "metadata": {"workout_id": workout_id},
            }).execute()
        except Exception as mem_exc:
            logger.warning("[athlete_workouts] memory event failed: %s", mem_exc)

        return check.data

    try:
        await run_in_threadpool(_save)
        return {"status": "saved", "workout_id": workout_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[athlete_workouts] notes failed workout=%s", workout_id)
        raise HTTPException(status_code=500, detail="Failed to save notes") from exc


# ── Coach endpoint ─────────────────────────────────────────────────────────────

@router.get("/api/v1/coach/athletes/{athlete_id}/workouts", response_model=list[WorkoutOut])
async def coach_list_athlete_workouts(
    athlete_id: str,
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Coach retrieves workouts for one of their athletes."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    scope = resolve_coach_scope(principal)

    def _fetch():
        # Verify athlete belongs to this coach
        athlete_check = (
            supabase.table("athletes")
            .select("id")
            .eq("id", athlete_id)
            .eq("coach_id", scope.coach_id)
            .is_("archived_at", "null")
            .single()
            .execute()
        )
        if not athlete_check.data:
            raise HTTPException(status_code=404, detail="Athlete not found")

        return (
            supabase.table("workouts")
            .select("*")
            .eq("athlete_id", athlete_id)
            .gte("scheduled_date", from_date)
            .lte("scheduled_date", to_date)
            .order("scheduled_date", desc=False)
            .execute()
        )

    try:
        result = await run_in_threadpool(_fetch)
        rows = result.data or []
        return [_row_to_workout(r) for r in rows]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[athlete_workouts] coach list failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load workouts") from exc
