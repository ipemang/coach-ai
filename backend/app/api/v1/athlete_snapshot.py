"""COA-120: Athlete snapshot — comprehensive single-athlete view for the coach.

Endpoint (coach-facing):
  GET /api/v1/coach/athletes/{athlete_id}/snapshot
    Returns: AI profile, recent memory feed, files, biometrics
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.security import (
    AuthenticatedPrincipal,
    require_roles,
    resolve_coach_scope,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["athlete-snapshot"])


# ── Models ────────────────────────────────────────────────────────────────────

class SnapshotFile(BaseModel):
    id: str
    original_filename: str
    document_type: Optional[str]
    ai_summary: Optional[str]
    ai_categorized: bool
    size_bytes: Optional[int]
    created_at: str


class SnapshotMemoryEvent(BaseModel):
    id: str
    event_type: str
    content: str
    created_at: str


class SnapshotBiometrics(BaseModel):
    readiness: Optional[float]
    hrv: Optional[float]
    rhr: Optional[float]
    sleep_hours: Optional[float]
    sleep_score: Optional[float]
    oura_sync_date: Optional[str]
    strava_last_activity: Optional[str]
    strava_last_distance_km: Optional[float]


class AthleteSnapshotOut(BaseModel):
    athlete_id: str
    full_name: str
    email: Optional[str]
    primary_sport: Optional[str]
    target_event_name: Optional[str]
    target_event_date: Optional[str]
    ai_profile_summary: Optional[str]
    onboarding_complete: bool
    files: list[SnapshotFile]
    memory: list[SnapshotMemoryEvent]
    biometrics: SnapshotBiometrics


# ── Coach endpoint ─────────────────────────────────────────────────────────────

@router.get("/api/v1/coach/athletes/{athlete_id}/snapshot", response_model=AthleteSnapshotOut)
async def get_athlete_snapshot(
    athlete_id: str,
    memory_limit: int = Query(20, ge=1, le=50),
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Full athlete snapshot for the coach view: profile, memory, files, biometrics."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    scope = resolve_coach_scope(principal)

    def _fetch() -> dict[str, Any]:
        # Verify athlete belongs to this coach
        athlete_res = (
            supabase.table("athletes")
            .select(
                "id, full_name, email, primary_sport, "
                "target_event_name, target_event_date, "
                "ai_profile_summary, onboarding_complete, "
                "current_state, stable_profile"
            )
            .eq("id", athlete_id)
            .eq("coach_id", scope.coach_id)
            .is_("archived_at", "null")
            .single()
            .execute()
        )
        if not athlete_res.data:
            raise HTTPException(status_code=404, detail="Athlete not found")
        athlete = athlete_res.data

        # Files with AI summaries
        files_res = (
            supabase.table("athlete_files")
            .select(
                "id, original_filename, document_type, ai_summary, "
                "ai_categorized, size_bytes, created_at"
            )
            .eq("athlete_id", athlete_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )

        # Recent memory feed
        memory_res = (
            supabase.table("athlete_memory_events")
            .select("id, event_type, content, created_at")
            .eq("athlete_id", athlete_id)
            .order("created_at", desc=True)
            .limit(memory_limit)
            .execute()
        )

        return {
            "athlete": athlete,
            "files": files_res.data or [],
            "memory": memory_res.data or [],
        }

    try:
        result = await run_in_threadpool(_fetch)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[snapshot] fetch failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load athlete snapshot") from exc

    athlete = result["athlete"]
    cs = athlete.get("current_state") or {}
    sp = athlete.get("stable_profile") or {}

    # Biometrics — merge Oura + fallback coach-entered values
    biometrics = SnapshotBiometrics(
        readiness=cs.get("oura_readiness_score") or cs.get("last_readiness_score"),
        hrv=cs.get("oura_avg_hrv") or cs.get("last_hrv"),
        rhr=cs.get("oura_avg_rhr") or cs.get("last_rhr"),
        sleep_hours=cs.get("oura_total_sleep_hours"),
        sleep_score=cs.get("oura_sleep_score") or cs.get("last_sleep_score"),
        oura_sync_date=cs.get("oura_sync_date"),
        strava_last_activity=cs.get("strava_last_activity_type"),
        strava_last_distance_km=cs.get("strava_last_distance_km"),
    )

    files = [
        SnapshotFile(
            id=str(f["id"]),
            original_filename=f.get("original_filename") or "",
            document_type=f.get("document_type"),
            ai_summary=f.get("ai_summary"),
            ai_categorized=bool(f.get("ai_categorized", False)),
            size_bytes=f.get("size_bytes"),
            created_at=str(f.get("created_at", "")),
        )
        for f in result["files"]
    ]

    memory = [
        SnapshotMemoryEvent(
            id=str(m["id"]),
            event_type=m.get("event_type") or "other",
            content=m.get("content") or "",
            created_at=str(m.get("created_at", "")),
        )
        for m in result["memory"]
    ]

    return AthleteSnapshotOut(
        athlete_id=str(athlete["id"]),
        full_name=athlete.get("full_name") or "",
        email=athlete.get("email"),
        primary_sport=athlete.get("primary_sport"),
        target_event_name=athlete.get("target_event_name") or sp.get("target_race"),
        target_event_date=athlete.get("target_event_date") or sp.get("race_date"),
        ai_profile_summary=athlete.get("ai_profile_summary"),
        onboarding_complete=bool(athlete.get("onboarding_complete", False)),
        files=files,
        memory=memory,
        biometrics=biometrics,
    )
