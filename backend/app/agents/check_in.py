from __future__ import annotations

from datetime import datetime, timezone
from os import getenv
from typing import Literal

from pydantic import BaseModel, Field
from supabase import Client, create_client

from app.services.scope import apply_scope_payload, resolve_scope_from_env


class AthleteCheckIn(BaseModel):
    athlete_id: str = Field(min_length=1)
    readiness: int = Field(ge=0, le=100)
    hrv: Literal["normal", "above", "below"]
    sleep_hours: float = Field(ge=0)
    sleep_quality: str = Field(min_length=1)
    soreness: int = Field(ge=0, le=10)


class CheckInRecommendation(BaseModel):
    recommended_action: str
    rationale: str


def assess_check_in(
    check_in: AthleteCheckIn,
    observed_at: datetime | None = None,
) -> CheckInRecommendation:
    current_time = (observed_at or datetime.now(timezone.utc)).astimezone()

    if current_time.weekday() == 0 and check_in.readiness < 75:
        return CheckInRecommendation(
            recommended_action="recovery",
            rationale="Monday Oura Gate: readiness is below 75, so convert any threshold session to recovery.",
        )

    if check_in.soreness >= 7:
        return CheckInRecommendation(
            recommended_action="recovery",
            rationale="Soreness is 7 or higher, so recovery is the safer choice.",
        )

    if check_in.sleep_hours < 7 and check_in.hrv == "below":
        return CheckInRecommendation(
            recommended_action="reduce intensity and volume",
            rationale="Sleep is under 7 hours and HRV is below baseline, so reduce intensity and volume and downshift training level.",
        )

    if check_in.sleep_hours < 7:
        return CheckInRecommendation(
            recommended_action="reduce intensity and volume",
            rationale="Sleep is under 7 hours, so reduce intensity and volume.",
        )

    if check_in.hrv == "below":
        return CheckInRecommendation(
            recommended_action="downshift training",
            rationale="HRV is below baseline, so downshift the training level.",
        )

    return CheckInRecommendation(
        recommended_action="continue planned session",
        rationale="Readiness, HRV, sleep, and soreness are within range, so continue the planned session.",
    )


def persist_check_in_state(
    check_in: AthleteCheckIn,
    recommendation: CheckInRecommendation,
    *,
    organization_id: str | None = None,
    coach_id: str | None = None,
) -> bool:
    supabase_url = getenv("SUPABASE_URL")
    supabase_key = (
        getenv("SUPABASE_SERVICE_ROLE_KEY")
        or getenv("SUPABASE_KEY")
        or getenv("SUPABASE_ANON_KEY")
    )

    if not supabase_url or not supabase_key:
        return False

    client: Client = create_client(supabase_url, supabase_key)
    scope = resolve_scope_from_env()
    if organization_id is not None:
        scope.organization_id = organization_id
    if coach_id is not None:
        scope.coach_id = coach_id
    if not scope.is_configured():
        return False

    client.table("memory_states").insert(
        apply_scope_payload(
            {
                "athlete_id": check_in.athlete_id,
                "state_type": "athlete_check_in",
                "check_in": check_in.model_dump(),
                "recommended_action": recommendation.recommended_action,
                "rationale": recommendation.rationale,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            scope,
        )
    ).execute()
    return True
