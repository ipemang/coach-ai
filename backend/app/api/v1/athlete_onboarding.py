"""COA-94: Athlete onboarding API — 5-step flow + AI profile generation.

Endpoints:
  POST  /api/v1/athlete/onboarding/identity      — Step 1: basic info (DOB, gender, fitness level)
  POST  /api/v1/athlete/onboarding/sports        — Step 2: sport profile
  POST  /api/v1/athlete/onboarding/goals         — Step 3: target event + goal description
  POST  /api/v1/athlete/onboarding/history       — Step 4: injury history + medical notes
  POST  /api/v1/athlete/onboarding/complete      — Step 5: mark complete + trigger AI profile gen
  GET   /api/v1/athlete/onboarding/status        — current step + completion state
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.security import AuthenticatedPrincipal, require_roles, resolve_athlete_scope

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/athlete/onboarding", tags=["athlete-onboarding"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_supabase(request: Request):
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return supabase


def _update_athlete(supabase, athlete_id: str, payload: dict) -> dict:
    result = supabase.table("athletes").update(payload).eq("id", athlete_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Athlete record not found")
    return result.data[0]


# ── Step 1: Identity ──────────────────────────────────────────────────────────

class OnboardingIdentityRequest(BaseModel):
    date_of_birth: Optional[str] = None     # ISO date string: "1990-04-15"
    gender: Optional[str] = None            # male | female | non_binary | prefer_not_to_say
    fitness_level: Optional[str] = None     # beginner | intermediate | advanced | elite


@router.post("/identity", summary="Step 1: identity info (COA-94)")
async def onboarding_identity(
    body: OnboardingIdentityRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Step 1 of athlete onboarding. Saves basic identity info and advances step to 1."""
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict = {"onboarding_step": 1}
    if body.date_of_birth:
        payload["date_of_birth"] = body.date_of_birth
    if body.gender:
        payload["gender"] = body.gender
    if body.fitness_level:
        payload["fitness_level"] = body.fitness_level

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 1}


# ── Step 2: Sport profile ─────────────────────────────────────────────────────

class OnboardingSportsRequest(BaseModel):
    primary_sport: Optional[str] = None         # triathlon | running | cycling | swimming
    secondary_sports: list[str] = []
    years_training: Optional[int] = None
    current_weekly_hours: Optional[float] = None


@router.post("/sports", summary="Step 2: sport profile (COA-94)")
async def onboarding_sports(
    body: OnboardingSportsRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Step 2 of athlete onboarding. Saves sport profile and advances step to 2."""
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict = {"onboarding_step": 2}
    if body.primary_sport:
        payload["primary_sport"] = body.primary_sport
    if body.secondary_sports:
        payload["secondary_sports"] = body.secondary_sports
    if body.years_training is not None:
        payload["years_training"] = body.years_training
    if body.current_weekly_hours is not None:
        payload["current_weekly_hours"] = body.current_weekly_hours

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 2}


# ── Step 3: Goals ─────────────────────────────────────────────────────────────

class OnboardingGoalsRequest(BaseModel):
    target_event_name: Optional[str] = None
    target_event_date: Optional[str] = None      # ISO date string
    target_event_distance: Optional[str] = None  # 5k | half_marathon | marathon | 70.3 | ironman | etc.
    goal_description: Optional[str] = None
    success_definition: Optional[str] = None
    previous_bests: Optional[str] = None


@router.post("/goals", summary="Step 3: race goals (COA-94)")
async def onboarding_goals(
    body: OnboardingGoalsRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Step 3 of athlete onboarding. Saves race goals and advances step to 3."""
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict = {"onboarding_step": 3}
    if body.target_event_name:
        payload["target_event_name"] = body.target_event_name
    if body.target_event_date:
        payload["target_event_date"] = body.target_event_date
    if body.target_event_distance:
        payload["target_event_distance"] = body.target_event_distance
    if body.goal_description:
        payload["goal_description"] = body.goal_description
    if body.success_definition:
        payload["success_definition"] = body.success_definition
    if body.previous_bests:
        payload["previous_bests"] = body.previous_bests

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 3}


# ── Step 4: Health history ────────────────────────────────────────────────────

class OnboardingHistoryRequest(BaseModel):
    injury_history: Optional[str] = None
    medical_notes: Optional[str] = None
    current_limiters: Optional[str] = None


@router.post("/history", summary="Step 4: health history (COA-94)")
async def onboarding_history(
    body: OnboardingHistoryRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Step 4 of athlete onboarding. Saves health history and advances step to 4."""
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict = {"onboarding_step": 4}
    if body.injury_history:
        payload["injury_history"] = body.injury_history
    if body.medical_notes:
        payload["medical_notes"] = body.medical_notes
    if body.current_limiters:
        payload["current_limiters"] = body.current_limiters

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 4}


# ── Step 5: Complete — trigger AI profile generation ──────────────────────────

def _generate_ai_profile(athlete_data: dict) -> str:
    """Synchronous — run via run_in_threadpool. Calls the LLM to generate a
    3-4 sentence athlete profile from the onboarding data."""
    from app.services.llm_client import LLMClient, LLMClientError

    name = athlete_data.get("full_name") or "the athlete"
    primary_sport = athlete_data.get("primary_sport") or "endurance sport"
    fitness_level = athlete_data.get("fitness_level") or "unspecified"
    years_training = athlete_data.get("years_training")
    weekly_hours = athlete_data.get("current_weekly_hours")
    goal = athlete_data.get("goal_description") or ""
    target_event = athlete_data.get("target_event_name") or ""
    target_distance = athlete_data.get("target_event_distance") or ""
    injury = athlete_data.get("injury_history") or "none reported"
    limiters = athlete_data.get("current_limiters") or "none specified"
    success = athlete_data.get("success_definition") or ""

    system_prompt = (
        "You are an expert endurance sports coach AI. "
        "Your task is to write a concise, factual athlete profile (3-4 sentences) "
        "based on the onboarding information provided. "
        "The profile will be used as context for AI coaching decisions — be accurate and specific. "
        "Do not invent details not present in the input. "
        "Write in third person. Do not include greetings or sign-offs."
    )

    user_prompt = f"""Generate a 3-4 sentence athlete profile for {name}:

Sport: {primary_sport}
Fitness level: {fitness_level}
Years training: {years_training if years_training is not None else 'unknown'}
Current weekly training hours: {weekly_hours if weekly_hours is not None else 'unknown'}
Target event: {target_event} {target_distance}
Goal: {goal}
Definition of success: {success}
Injury history: {injury}
Current limiters: {limiters}

Write a concise profile that summarises who this athlete is, their current level, their goal, and any key considerations for their coach."""

    client = LLMClient()
    try:
        response = client.chat_completions(system=system_prompt, user=user_prompt)
        return response.content.strip()
    except LLMClientError as exc:
        logger.error("[ai_profile] LLM call failed for athlete %s: %s", athlete_data.get("id", "?")[:8], exc)
        # Return a fallback summary so onboarding isn't blocked
        return (
            f"{name} is a {fitness_level} {primary_sport} athlete"
            + (f" with {years_training} years of training experience" if years_training else "")
            + (f", currently training {weekly_hours} hours per week" if weekly_hours else "")
            + (f". Their primary goal is: {goal}" if goal else "")
            + "."
        )


@router.post("/complete", summary="Step 5: complete onboarding + generate AI profile (COA-94)")
async def onboarding_complete(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Step 5 of athlete onboarding. Marks onboarding complete and triggers
    AI profile generation. The profile is stored in athletes.ai_profile_summary
    and also written to athletes.memory_summary so AI coaching has immediate context.

    This endpoint is idempotent — calling it again regenerates the profile.
    """
    supabase = _get_supabase(request)
    athlete_id, coach_id = resolve_athlete_scope(principal)

    # Load full athlete row for the AI profile call
    try:
        row = supabase.table("athletes").select("*").eq("id", athlete_id).single().execute()
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Athlete record not found") from exc

    if not row.data:
        raise HTTPException(status_code=404, detail="Athlete record not found")

    athlete_data = row.data

    # Generate AI profile (sync LLM call — run in threadpool per Hard Rule 7)
    ai_profile = await run_in_threadpool(_generate_ai_profile, athlete_data)

    # Persist: mark onboarding complete, store AI profile, seed memory_summary
    update_payload: dict = {
        "onboarding_step": 5,
        "onboarding_complete": True,
        "ai_profile_summary": ai_profile,
        "status": "active",
    }

    # Seed memory_summary if it's empty — gives AI coaching context from day 1
    existing_memory = (athlete_data.get("memory_summary") or "").strip()
    if not existing_memory:
        update_payload["memory_summary"] = ai_profile

    _update_athlete(supabase, athlete_id, update_payload)

    logger.info(
        "[onboarding/complete] Athlete %s onboarding complete — AI profile generated (%d chars)",
        athlete_id[:8], len(ai_profile),
    )

    return {
        "onboarding_complete": True,
        "onboarding_step": 5,
        "ai_profile_summary": ai_profile,
    }


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status", summary="Get current onboarding step and completion (COA-94)")
async def onboarding_status(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Returns the athlete's current onboarding step and whether onboarding is complete.
    Used by the frontend to determine which onboarding screen to show on login.
    """
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    try:
        row = supabase.table("athletes").select(
            "id, onboarding_step, onboarding_complete, ai_profile_summary, full_name"
        ).eq("id", athlete_id).single().execute()
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Athlete record not found") from exc

    if not row.data:
        raise HTTPException(status_code=404, detail="Athlete record not found")

    data = row.data
    return {
        "athlete_id": athlete_id,
        "full_name": data.get("full_name"),
        "onboarding_step": data.get("onboarding_step", 0),
        "onboarding_complete": data.get("onboarding_complete", False),
        "has_ai_profile": bool(data.get("ai_profile_summary")),
    }
