"""COA-113: Athlete profile API — settings save + real coach data.

Endpoints (athlete-facing):
  GET   /api/v1/athlete/coach     — get the athlete's coach profile
  PATCH /api/v1/athlete/profile   — update athlete profile fields
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.security import (
    AuthenticatedPrincipal,
    require_roles,
    resolve_athlete_scope,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["athlete-profile"])


# ── Models ────────────────────────────────────────────────────────────────────

class CoachProfileOut(BaseModel):
    id: str
    name: str
    initials: str
    whatsapp: Optional[str]
    email: Optional[str]


class AthleteProfileIn(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    target_event_name: Optional[str] = None
    target_event_date: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _name_to_initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "?"
    return "".join(p[0].upper() for p in parts[:2])


# ── Athlete endpoints ─────────────────────────────────────────────────────────

@router.get("/api/v1/athlete/coach", response_model=CoachProfileOut)
async def get_athlete_coach(
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Return the athlete's assigned coach profile."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, coach_id = resolve_athlete_scope(principal)
    if not coach_id:
        raise HTTPException(status_code=404, detail="No coach assigned")

    def _fetch():
        return (
            supabase.table("coaches")
            .select("id, full_name, whatsapp_number, email")
            .eq("id", coach_id)
            .single()
            .execute()
        )

    try:
        result = await run_in_threadpool(_fetch)
        if not result.data:
            raise HTTPException(status_code=404, detail="Coach not found")
        row = result.data
        name = row.get("full_name") or "Your Coach"
        return CoachProfileOut(
            id=str(row["id"]),
            name=name,
            initials=_name_to_initials(name),
            whatsapp=row.get("whatsapp_number"),
            email=row.get("email"),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[athlete_profile] get coach failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load coach profile") from exc


@router.patch("/api/v1/athlete/profile", response_model=dict)
async def update_athlete_profile(
    body: AthleteProfileIn,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Update athlete profile fields from Settings."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict = {}
    if body.full_name is not None:
        payload["full_name"] = body.full_name.strip()
    if body.email is not None:
        payload["email"] = body.email.strip()
    if body.target_event_name is not None:
        payload["target_event_name"] = body.target_event_name.strip()
    if body.target_event_date is not None:
        payload["target_event_date"] = body.target_event_date or None

    if not payload:
        return {"status": "no_changes"}

    def _update():
        return (
            supabase.table("athletes")
            .update(payload)
            .eq("id", athlete_id)
            .execute()
        )

    try:
        await run_in_threadpool(_update)
        return {"status": "updated", "fields": list(payload.keys())}
    except Exception as exc:
        logger.exception("[athlete_profile] update failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to update profile") from exc
