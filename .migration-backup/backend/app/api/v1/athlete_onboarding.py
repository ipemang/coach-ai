"""COA-109: Athlete onboarding API — comprehensive 3-path, 7-step flow + AI profile generation.

Endpoints:
  POST  /api/v1/athlete/onboarding/type         — Step 0: athlete type fork
  POST  /api/v1/athlete/onboarding/background   — Steps 1–2: about you + athletic background
  POST  /api/v1/athlete/onboarding/training     — Step 3: training baseline
  POST  /api/v1/athlete/onboarding/goals        — Step 4: race calendar + goals
  POST  /api/v1/athlete/onboarding/health       — Step 5: health & body
  POST  /api/v1/athlete/onboarding/lifestyle    — Step 6: lifestyle & availability
  POST  /api/v1/athlete/onboarding/complete     — Step 7: mark complete + trigger AI profile gen
  POST  /api/v1/athlete/onboarding/refresh      — Returning athletes: profile update + re-gen
  GET   /api/v1/athlete/onboarding/status       — current step + completion state
"""
from __future__ import annotations

import logging
from typing import Any, Optional

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


# ── Step 0: Athlete type fork ─────────────────────────────────────────────────

class OnboardingTypeRequest(BaseModel):
    athlete_type: str   # new_fresh | new_existing_relationship | returning


@router.post("/type", summary="Step 0: athlete type selection (COA-109)")
async def onboarding_type(
    body: OnboardingTypeRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    valid = {"new_fresh", "new_existing_relationship", "returning"}
    if body.athlete_type not in valid:
        raise HTTPException(status_code=422, detail=f"athlete_type must be one of: {valid}")

    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)
    _update_athlete(supabase, athlete_id, {"athlete_type": body.athlete_type, "onboarding_step": 0})
    return {"saved": True, "athlete_type": body.athlete_type}


# ── Steps 1–2: About you + athletic background ────────────────────────────────

class OnboardingBackgroundRequest(BaseModel):
    # About you (step 1)
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    occupation: Optional[str] = None
    how_found_coach: Optional[str] = None
    coach_relationship_duration: Optional[str] = None   # for existing-relationship athletes
    # Athletic background (step 2)
    fitness_level: Optional[str] = None
    primary_sport: Optional[str] = None
    secondary_sports: list[str] = []
    years_training: Optional[int] = None
    previous_coaches: Optional[str] = None
    competitive_history: Optional[str] = None


@router.post("/background", summary="Steps 1–2: about you + athletic background (COA-109)")
async def onboarding_background(
    body: OnboardingBackgroundRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict[str, Any] = {"onboarding_step": 2}
    for field, value in {
        "date_of_birth": body.date_of_birth,
        "gender": body.gender,
        "occupation": body.occupation,
        "how_found_coach": body.how_found_coach,
        "coach_relationship_duration": body.coach_relationship_duration,
        "fitness_level": body.fitness_level,
        "primary_sport": body.primary_sport,
        "years_training": body.years_training,
        "previous_coaches": body.previous_coaches,
        "competitive_history": body.competitive_history,
    }.items():
        if value is not None:
            payload[field] = value
    if body.secondary_sports:
        payload["secondary_sports"] = body.secondary_sports

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 2}


# ── Step 3: Training baseline ─────────────────────────────────────────────────

class OnboardingTrainingRequest(BaseModel):
    current_weekly_hours: Optional[float] = None
    typical_week_description: Optional[str] = None


@router.post("/training", summary="Step 3: training baseline (COA-109)")
async def onboarding_training(
    body: OnboardingTrainingRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict[str, Any] = {"onboarding_step": 3}
    if body.current_weekly_hours is not None:
        payload["current_weekly_hours"] = body.current_weekly_hours
    if body.typical_week_description:
        payload["typical_week_description"] = body.typical_week_description

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 3}


# ── Step 4: Goals & race calendar ────────────────────────────────────────────

class SecondaryEvent(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None
    distance: Optional[str] = None
    priority: Optional[str] = None   # A | B | C


class OnboardingGoalsRequest(BaseModel):
    target_event_name: Optional[str] = None
    target_event_date: Optional[str] = None
    target_event_distance: Optional[str] = None
    goal_description: Optional[str] = None
    success_definition: Optional[str] = None
    previous_bests: Optional[str] = None
    race_motivation: Optional[str] = None
    secondary_events: list[SecondaryEvent] = []


@router.post("/goals", summary="Step 4: goals & race calendar (COA-109)")
async def onboarding_goals(
    body: OnboardingGoalsRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict[str, Any] = {"onboarding_step": 4}
    for field, value in {
        "target_event_name": body.target_event_name,
        "target_event_date": body.target_event_date,
        "target_event_distance": body.target_event_distance,
        "goal_description": body.goal_description,
        "success_definition": body.success_definition,
        "previous_bests": body.previous_bests,
        "race_motivation": body.race_motivation,
    }.items():
        if value is not None:
            payload[field] = value
    if body.secondary_events:
        payload["secondary_events"] = [e.model_dump(exclude_none=True) for e in body.secondary_events]

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 4}


# ── Step 5: Health & body ─────────────────────────────────────────────────────

class OnboardingHealthRequest(BaseModel):
    injury_history: Optional[str] = None
    medical_notes: Optional[str] = None
    medications: Optional[str] = None
    current_limiters: Optional[str] = None
    sleep_hours: Optional[float] = None
    resting_hr: Optional[int] = None


@router.post("/health", summary="Step 5: health & body (COA-109)")
async def onboarding_health(
    body: OnboardingHealthRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict[str, Any] = {"onboarding_step": 5}
    for field, value in {
        "injury_history": body.injury_history,
        "medical_notes": body.medical_notes,
        "medications": body.medications,
        "current_limiters": body.current_limiters,
        "sleep_hours": body.sleep_hours,
        "resting_hr": body.resting_hr,
    }.items():
        if value is not None:
            payload[field] = value

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 5}


# ── Step 6: Lifestyle & availability ─────────────────────────────────────────

class OnboardingLifestyleRequest(BaseModel):
    training_availability: Optional[dict] = None   # {days, preferred_time, travel_frequency, constraints}
    equipment_access: list[str] = []
    communication_preference: Optional[str] = None
    coaching_expectations: Optional[str] = None


@router.post("/lifestyle", summary="Step 6: lifestyle & availability (COA-109)")
async def onboarding_lifestyle(
    body: OnboardingLifestyleRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict[str, Any] = {"onboarding_step": 6}
    if body.training_availability:
        payload["training_availability"] = body.training_availability
    if body.equipment_access:
        payload["equipment_access"] = body.equipment_access
    if body.communication_preference:
        payload["communication_preference"] = body.communication_preference
    if body.coaching_expectations:
        payload["coaching_expectations"] = body.coaching_expectations

    _update_athlete(supabase, athlete_id, payload)
    return {"saved": True, "onboarding_step": 6}


# ── AI profile generation (shared by complete + refresh) ─────────────────────

def _generate_ai_profile(athlete_data: dict) -> str:
    from app.services.llm_client import LLMClient, LLMClientError

    def _s(key: str, fallback: str = "not specified") -> str:
        v = athlete_data.get(key)
        return str(v).strip() if v else fallback

    name = _s("full_name", "the athlete")
    sport = _s("primary_sport", "endurance sport")
    level = _s("fitness_level")
    years = athlete_data.get("years_training")
    hours = athlete_data.get("current_weekly_hours")
    occupation = _s("occupation")
    typical_week = _s("typical_week_description")
    goal = _s("goal_description")
    motivation = _s("race_motivation")
    event = _s("target_event_name")
    distance = _s("target_event_distance")
    event_date = _s("target_event_date")
    success = _s("success_definition")
    bests = _s("previous_bests")
    injury = _s("injury_history", "none reported")
    limiters = _s("current_limiters", "none specified")
    medical = _s("medical_notes")
    medications = _s("medications")
    sleep = athlete_data.get("sleep_hours")
    resting_hr = athlete_data.get("resting_hr")
    equipment = ", ".join(athlete_data.get("equipment_access") or []) or "not specified"
    expectations = _s("coaching_expectations")
    competitive = _s("competitive_history")
    athlete_type = _s("athlete_type")
    relationship_duration = _s("coach_relationship_duration")

    availability = athlete_data.get("training_availability") or {}
    avail_days = ", ".join(availability.get("days") or []) or "not specified"
    avail_time = availability.get("preferred_time", "not specified")
    avail_constraints = availability.get("constraints", "none")

    existing_memory = (athlete_data.get("memory_summary") or "").strip()

    system_prompt = (
        "You are an expert endurance sports coach AI. "
        "Write a concise, factual athlete profile (4-6 sentences) based on the onboarding data. "
        "The profile is used as permanent context for AI coaching decisions — be specific and accurate. "
        "Do not invent details not present in the input. Write in third person. "
        "Prioritise: current level, training context, primary goal, key health/limiter notes, and coaching expectations. "
        "If existing memory context is provided, incorporate and update it — do not discard prior knowledge. "
        "No greetings or sign-offs."
    )

    memory_prefix = ""
    if existing_memory:
        memory_prefix = (
            "EXISTING MEMORY CONTEXT (prior accumulated knowledge about this athlete — incorporate and update):\n"
            f"{existing_memory}\n\n---\n\n"
        )

    user_prompt = f"""{memory_prefix}Generate an athlete profile for {name}:

RELATIONSHIP: {athlete_type.replace("_", " ")} {f"({relationship_duration} with coach)" if relationship_duration != "not specified" else ""}
SPORT: {sport} | LEVEL: {level} | YEARS TRAINING: {years if years is not None else "unknown"}
OCCUPATION: {occupation}
WEEKLY HOURS: {hours if hours is not None else "unknown"}
TYPICAL WEEK: {typical_week}
EQUIPMENT: {equipment}
COMPETITIVE HISTORY: {competitive}

PRIMARY TARGET: {event} {distance} on {event_date}
GOAL: {goal}
MOTIVATION: {motivation}
SUCCESS DEFINITION: {success}
PREVIOUS BESTS: {bests}

INJURIES: {injury}
MEDICAL: {medical}
MEDICATIONS: {medications}
CURRENT LIMITERS: {limiters}
SLEEP: {f"{sleep} hrs/night" if sleep else "not specified"}
RESTING HR: {f"{resting_hr} bpm" if resting_hr else "not specified"}

AVAILABLE DAYS: {avail_days} | PREFERRED TIME: {avail_time}
TRAINING CONSTRAINTS: {avail_constraints}
COACHING EXPECTATIONS: {expectations}

Write a 4-6 sentence profile covering who this athlete is, their training context, primary goal, key health considerations, and what they expect from this coaching relationship."""

    client = LLMClient()
    try:
        response = client.chat_completions(system=system_prompt, user=user_prompt)
        return response.content.strip()
    except LLMClientError as exc:
        logger.error("[ai_profile] LLM call failed for athlete %s: %s", str(athlete_data.get("id", "?"))[:8], exc)
        return (
            f"{name} is a {level} {sport} athlete"
            + (f" with {years} years of training" if years else "")
            + (f", training {hours} hours/week" if hours else "")
            + (f". Primary goal: {goal}" if goal else "")
            + (f" Target: {event} on {event_date}." if event else "")
            + (f" Key limiter: {limiters}." if limiters != "none specified" else "")
        )


# ── Step 7: Complete — trigger AI profile generation ──────────────────────────

@router.post("/complete", summary="Step 7: complete onboarding + generate AI profile (COA-109)")
async def onboarding_complete(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    try:
        row = supabase.table("athletes").select("*").eq("id", athlete_id).single().execute()
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Athlete record not found") from exc

    if not row.data:
        raise HTTPException(status_code=404, detail="Athlete record not found")

    ai_profile = await run_in_threadpool(_generate_ai_profile, row.data)

    update_payload: dict = {
        "onboarding_step": 7,
        "onboarding_complete": True,
        "ai_profile_summary": ai_profile,
        "memory_summary": ai_profile,  # always refresh — AI profile already incorporates prior memory
    }

    _update_athlete(supabase, athlete_id, update_payload)

    logger.info(
        "[onboarding/complete] Athlete %s onboarding complete — AI profile %d chars",
        athlete_id[:8], len(ai_profile),
    )
    return {"onboarding_complete": True, "onboarding_step": 7, "ai_profile_summary": ai_profile}


# ── Profile refresh (returning athletes) ─────────────────────────────────────

class ProfileRefreshRequest(BaseModel):
    # What's changed
    injury_history: Optional[str] = None
    medical_notes: Optional[str] = None
    current_limiters: Optional[str] = None
    training_availability: Optional[dict] = None
    # New goals
    target_event_name: Optional[str] = None
    target_event_date: Optional[str] = None
    target_event_distance: Optional[str] = None
    goal_description: Optional[str] = None
    race_motivation: Optional[str] = None
    secondary_events: list[SecondaryEvent] = []


@router.post("/refresh", summary="Profile refresh for returning athletes (COA-109)")
async def onboarding_refresh(
    body: ProfileRefreshRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Short update flow for athletes already in the app. Updates changed fields
    and regenerates the AI profile summary to reflect the new season context.
    """
    from datetime import datetime, timezone

    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    payload: dict[str, Any] = {
        "profile_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }
    for field, value in {
        "injury_history": body.injury_history,
        "medical_notes": body.medical_notes,
        "current_limiters": body.current_limiters,
        "target_event_name": body.target_event_name,
        "target_event_date": body.target_event_date,
        "target_event_distance": body.target_event_distance,
        "goal_description": body.goal_description,
        "race_motivation": body.race_motivation,
    }.items():
        if value is not None:
            payload[field] = value
    if body.training_availability:
        payload["training_availability"] = body.training_availability
    if body.secondary_events:
        payload["secondary_events"] = [e.model_dump(exclude_none=True) for e in body.secondary_events]

    _update_athlete(supabase, athlete_id, payload)

    try:
        row = supabase.table("athletes").select("*").eq("id", athlete_id).single().execute()
        if row.data:
            ai_profile = await run_in_threadpool(_generate_ai_profile, row.data)
            _update_athlete(supabase, athlete_id, {
                "ai_profile_summary": ai_profile,
                "memory_summary": ai_profile,
            })
            return {"refreshed": True, "ai_profile_summary": ai_profile}
    except Exception:
        logger.warning("[onboarding/refresh] AI profile regen failed for %s", athlete_id[:8])

    return {"refreshed": True, "ai_profile_summary": None}


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status", summary="Get current onboarding step and completion (COA-109)")
async def onboarding_status(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    supabase = _get_supabase(request)
    athlete_id, _ = resolve_athlete_scope(principal)

    try:
        row = supabase.table("athletes").select(
            "id, onboarding_step, onboarding_complete, ai_profile_summary, full_name, athlete_type"
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
        "athlete_type": data.get("athlete_type"),
        "has_ai_profile": bool(data.get("ai_profile_summary")),
    }
