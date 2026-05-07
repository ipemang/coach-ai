"""COA-113: Athlete profile API — settings save + real coach data.

Endpoints (athlete-facing):
  GET   /api/v1/athlete/profile   — get the athlete's own profile fields
  GET   /api/v1/athlete/coach     — get the athlete's coach profile
  PATCH /api/v1/athlete/profile   — update athlete profile fields
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
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


class AthleteProfileOut(BaseModel):
    id: str
    full_name: str
    email: Optional[str]
    primary_sport: Optional[str]
    ai_profile_summary: Optional[str]
    target_event_name: Optional[str]
    target_event_date: Optional[str]
    ftp: Optional[int] = None
    threshold_pace: Optional[str] = None
    css_pace: Optional[str] = None
    oura_readiness: Optional[int] = None
    oura_hrv: Optional[int] = None
    oura_sleep_score: Optional[int] = None
    oura_readiness_trend: Optional[list] = None


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

@router.get("/api/v1/athlete/profile", response_model=AthleteProfileOut)
async def get_athlete_profile(
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Return the athlete's own profile fields (bypasses RLS — uses service role)."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    def _fetch():
        return (
            supabase.table("athletes")
            .select("id,full_name,email,primary_sport,ai_profile_summary,target_event_name,target_event_date,ftp,threshold_pace,css_pace,current_state")
            .eq("id", athlete_id)
            .single()
            .execute()
        )

    try:
        result = await run_in_threadpool(_fetch)
        if not result.data:
            raise HTTPException(status_code=404, detail="Athlete profile not found")
        row = result.data
        cs = row.get("current_state") or {}
        oura_readiness = None
        oura_hrv = None
        oura_sleep = None
        try:
            if cs.get("oura_readiness_score") is not None:
                oura_readiness = int(cs["oura_readiness_score"])
        except (TypeError, ValueError):
            pass
        try:
            if cs.get("oura_avg_hrv") is not None:
                oura_hrv = int(cs["oura_avg_hrv"])
        except (TypeError, ValueError):
            pass
        try:
            if cs.get("oura_sleep_score") is not None:
                oura_sleep = int(cs["oura_sleep_score"])
        except (TypeError, ValueError):
            pass
        return AthleteProfileOut(
            id=str(row["id"]),
            full_name=row.get("full_name") or "Athlete",
            email=row.get("email"),
            primary_sport=row.get("primary_sport"),
            ai_profile_summary=row.get("ai_profile_summary"),
            target_event_name=row.get("target_event_name"),
            target_event_date=row.get("target_event_date"),
            ftp=row.get("ftp"),
            threshold_pace=row.get("threshold_pace"),
            css_pace=row.get("css_pace"),
            oura_readiness=oura_readiness,
            oura_hrv=oura_hrv,
            oura_sleep_score=oura_sleep,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[athlete_profile] get profile failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load athlete profile") from exc


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


@router.get("/api/v1/athlete/reports")
async def get_athlete_reports(
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Return published training reports for the athlete (newest first)."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    def _fetch():
        return (
            supabase.table("training_reports")
            .select("id,title,week_of,published_at,compliance_pct,total_hours,notes,summary_text")
            .eq("athlete_id", athlete_id)
            .eq("status", "published")
            .order("published_at", desc=True)
            .limit(20)
            .execute()
        )

    try:
        result = await run_in_threadpool(_fetch)
        rows = result.data or []
        return JSONResponse(content=rows)
    except Exception as exc:
        logger.exception("[athlete_profile] get reports failed athlete=%s", athlete_id[:8])
        return JSONResponse(content=[])
