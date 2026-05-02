from __future__ import annotations

from datetime import datetime, timezone
from os import getenv
from typing import Any, Literal

from pydantic import BaseModel, Field
from supabase import Client, create_client

from app.services.scope import apply_scope_payload, resolve_scope_from_env


class BiologicalBaselineBloodWork(BaseModel):
    panel_date: str | None = None
    markers: dict[str, float | str | bool | None] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class BiologicalBaselineDNA(BaseModel):
    panel_date: str | None = None
    markers: dict[str, float | str | bool | None] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class BiologicalBaseline(BaseModel):
    age_years: int | None = Field(default=None, ge=0, le=120)
    training_age_years: float | None = Field(default=None, ge=0)
    blood_work: BiologicalBaselineBloodWork = Field(default_factory=BiologicalBaselineBloodWork)
    dna: BiologicalBaselineDNA = Field(default_factory=BiologicalBaselineDNA)


class AthleteCheckIn(BaseModel):
    athlete_id: str = Field(min_length=1)
    readiness: int = Field(ge=0, le=100)
    hrv: Literal["normal", "above", "below"]
    sleep_hours: float = Field(ge=0)
    sleep_quality: str = Field(min_length=1)
    soreness: int = Field(ge=0, le=10)
    biological_baseline: BiologicalBaseline | None = None


class CheckInRecommendation(BaseModel):
    recommended_action: str
    rationale: str
    baseline_adjustments: list[str] = Field(default_factory=list)
    recovery_expectation: str | None = None
    fatigue_expectation: str | None = None


def assess_check_in(
    check_in: AthleteCheckIn,
    observed_at: datetime | None = None,
) -> CheckInRecommendation:
    current_time = (observed_at or datetime.now(timezone.utc)).astimezone()
    baseline_penalty, baseline_adjustments, recovery_expectation, fatigue_expectation = _score_biological_baseline(
        check_in.biological_baseline
    )
    effective_readiness = max(0.0, float(check_in.readiness) - baseline_penalty)
    effective_soreness = min(10.0, float(check_in.soreness) + baseline_penalty / 4.0)

    if current_time.weekday() == 0 and effective_readiness < 75:
        return CheckInRecommendation(
            recommended_action="recovery",
            rationale=_with_baseline_note(
                "Monday Oura Gate: adjusted readiness is below 75, so convert any threshold session to recovery.",
                baseline_adjustments,
            ),
            baseline_adjustments=baseline_adjustments,
            recovery_expectation=recovery_expectation,
            fatigue_expectation=fatigue_expectation,
        )

    if effective_soreness >= 7:
        return CheckInRecommendation(
            recommended_action="recovery",
            rationale=_with_baseline_note(
                "Adjusted soreness is 7 or higher, so recovery is the safer choice.",
                baseline_adjustments,
            ),
            baseline_adjustments=baseline_adjustments,
            recovery_expectation=recovery_expectation,
            fatigue_expectation=fatigue_expectation,
        )

    if check_in.sleep_hours < 7 and check_in.hrv == "below":
        return CheckInRecommendation(
            recommended_action="reduce intensity and volume",
            rationale=_with_baseline_note(
                "Sleep is under 7 hours and HRV is below baseline, so reduce intensity and volume and downshift training level.",
                baseline_adjustments,
            ),
            baseline_adjustments=baseline_adjustments,
            recovery_expectation=recovery_expectation,
            fatigue_expectation=fatigue_expectation,
        )

    if check_in.sleep_hours < 7:
        return CheckInRecommendation(
            recommended_action="reduce intensity and volume",
            rationale=_with_baseline_note(
                "Sleep is under 7 hours, so reduce intensity and volume.",
                baseline_adjustments,
            ),
            baseline_adjustments=baseline_adjustments,
            recovery_expectation=recovery_expectation,
            fatigue_expectation=fatigue_expectation,
        )

    if check_in.hrv == "below":
        return CheckInRecommendation(
            recommended_action="downshift training",
            rationale=_with_baseline_note(
                "HRV is below baseline, so downshift the training level.",
                baseline_adjustments,
            ),
            baseline_adjustments=baseline_adjustments,
            recovery_expectation=recovery_expectation,
            fatigue_expectation=fatigue_expectation,
        )

    return CheckInRecommendation(
        recommended_action="continue planned session",
        rationale=_with_baseline_note(
            "Readiness, HRV, sleep, and soreness are within range, so continue the planned session.",
            baseline_adjustments,
        ),
        baseline_adjustments=baseline_adjustments,
        recovery_expectation=recovery_expectation,
        fatigue_expectation=fatigue_expectation,
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


def _score_biological_baseline(baseline: BiologicalBaseline | None) -> tuple[float, list[str], str | None, str | None]:
    if baseline is None:
        return 0.0, [], None, None

    adjustments: list[str] = []
    penalty = 0.0

    age_years = baseline.age_years
    if age_years is not None:
        if age_years >= 45:
            penalty += 6.0
            adjustments.append(f"Age {age_years} suggests a slower recovery curve than a younger baseline")
        elif age_years >= 35:
            penalty += 4.0
            adjustments.append(f"Age {age_years} adds a modest recovery load adjustment")
        elif age_years >= 30:
            penalty += 2.0
            adjustments.append(f"Age {age_years} adds a light recovery load adjustment")

    training_age_years = baseline.training_age_years
    if training_age_years is not None:
        if training_age_years < 1:
            penalty += 8.0
            adjustments.append("Training age under 1 year suggests the athlete will absorb fatigue less efficiently")
        elif training_age_years < 3:
            penalty += 5.0
            adjustments.append(f"Training age {training_age_years:g} years suggests a less robust fatigue buffer")
        elif training_age_years < 5:
            penalty += 2.0
            adjustments.append(f"Training age {training_age_years:g} years adds a light fatigue adjustment")

    penalty += _score_marker_scaffold("blood work", baseline.blood_work.markers, baseline.blood_work.notes, adjustments)
    penalty += _score_marker_scaffold("DNA", baseline.dna.markers, baseline.dna.notes, adjustments)

    penalty = min(penalty, 15.0)

    if baseline_adjustments := adjustments:
        recovery_expectation = "Expect a slower recovery than the default model because of the biological baseline."
        fatigue_expectation = "Expect fatigue to accumulate earlier than the default model because of the biological baseline."
    else:
        recovery_expectation = None
        fatigue_expectation = None

    return penalty, baseline_adjustments, recovery_expectation, fatigue_expectation


def _score_marker_scaffold(
    label: str,
    markers: dict[str, float | str | bool | None],
    notes: list[str],
    adjustments: list[str],
) -> float:
    penalty = 0.0
    flagged_terms = {"low", "below", "deficient", "insufficient", "high", "elevated", "abnormal", "variant", "risk", "slow", "poor"}

    for key, value in markers.items():
        text = _string_value(value)
        if text is None:
            continue
        normalized = text.lower()
        if any(term in normalized for term in flagged_terms):
            penalty += 3.0
            adjustments.append(f"{label.title()} marker {key} is flagged as {text}")

    for note in notes:
        note_text = _string_value(note)
        if note_text:
            adjustments.append(f"{label.title()} note: {note_text}")

    return min(penalty, 6.0)


def _with_baseline_note(message: str, baseline_adjustments: list[str]) -> str:
    if not baseline_adjustments:
        return message
    return f"{message} Biological baseline adjustments: {'; '.join(baseline_adjustments)}."


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)
