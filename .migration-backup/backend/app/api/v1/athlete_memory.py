"""COA-117: Athlete memory events — wire athlete_memory_events table to dashboard + coach view.

Endpoints (athlete-facing):
  POST  /api/v1/athlete/memory-events        — write a new event
  GET   /api/v1/athlete/memory-events        — read own events

Endpoints (coach-facing):
  GET   /api/v1/coach/athletes/{id}/memory-events  — read athlete's events
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

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

router = APIRouter(tags=["athlete-memory"])

VALID_EVENT_TYPES = {
    "complete", "comment", "reschedule_request", "voice_memo",
    "file_upload", "whatsapp_athlete", "whatsapp_coach",
    "plan_change", "report_published", "sync",
}


# ── Models ────────────────────────────────────────────────────────────────────

class MemoryEventIn(BaseModel):
    event_type: str
    content: str
    metadata: Optional[dict[str, Any]] = None


class MemoryEventOut(BaseModel):
    id: str
    athlete_id: str
    event_type: str
    content: str
    metadata: Optional[dict[str, Any]]
    created_at: str


def _row_to_event(row: dict) -> MemoryEventOut:
    return MemoryEventOut(
        id=str(row["id"]),
        athlete_id=str(row["athlete_id"]),
        event_type=row.get("event_type") or "other",
        content=row.get("content") or "",
        metadata=row.get("metadata"),
        created_at=str(row.get("created_at", "")),
    )


# ── Athlete endpoints ─────────────────────────────────────────────────────────

@router.post("/api/v1/athlete/memory-events", response_model=MemoryEventOut, status_code=201)
async def create_memory_event(
    body: MemoryEventIn,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Athlete logs a dashboard action to their memory feed."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    if body.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid event_type. Must be one of: {sorted(VALID_EVENT_TYPES)}")

    def _insert():
        result = supabase.table("athlete_memory_events").insert({
            "athlete_id": athlete_id,
            "event_type": body.event_type,
            "content": body.content[:1000],  # cap at 1000 chars
            "metadata": body.metadata or {},
        }).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create memory event")
        return result.data[0]

    try:
        row = await run_in_threadpool(_insert)
        return _row_to_event(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[athlete_memory] create failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to create memory event") from exc


@router.get("/api/v1/athlete/memory-events", response_model=list[MemoryEventOut])
async def list_memory_events(
    limit: int = Query(50, ge=1, le=200),
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Athlete fetches their own memory feed."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    def _fetch():
        return (
            supabase.table("athlete_memory_events")
            .select("*")
            .eq("athlete_id", athlete_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

    try:
        result = await run_in_threadpool(_fetch)
        return [_row_to_event(r) for r in (result.data or [])]
    except Exception as exc:
        logger.exception("[athlete_memory] list failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load memory events") from exc


# ── Coach endpoint ─────────────────────────────────────────────────────────────

@router.get("/api/v1/coach/athletes/{athlete_id}/memory-events", response_model=list[MemoryEventOut])
async def coach_list_memory_events(
    athlete_id: str,
    limit: int = Query(50, ge=1, le=200),
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Coach reads memory feed for one of their athletes."""
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
            supabase.table("athlete_memory_events")
            .select("*")
            .eq("athlete_id", athlete_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

    try:
        result = await run_in_threadpool(_fetch)
        return [_row_to_event(r) for r in (result.data or [])]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[athlete_memory] coach list failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load memory events") from exc
