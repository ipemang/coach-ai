from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.check_in import AthleteCheckIn, CheckInRecommendation, assess_check_in, persist_check_in_state
from app.services import extract_methodology_from_transcript, get_settings, update_coach_methodology

router = APIRouter()


class ExtractMethodologyRequest(BaseModel):
    coach_id: str = Field(..., min_length=1, description="Supabase coach_id for the coach record")
    transcript: str = Field(..., min_length=1, description="Voice memo transcript to extract methodology from")


class MethodologyExtractionResponse(BaseModel):
    methodology_playbook: dict[str, Any]


@router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/check-in", tags=["athlete"], response_model=CheckInRecommendation)
def check_in(payload: AthleteCheckIn) -> CheckInRecommendation:
    recommendation = assess_check_in(payload)
    persist_check_in_state(payload, recommendation)
    return recommendation


@router.post("/extract-methodology", tags=["methodology"], response_model=MethodologyExtractionResponse)
def extract_methodology(payload: ExtractMethodologyRequest) -> MethodologyExtractionResponse:
    settings = get_settings()

    try:
        extraction = extract_methodology_from_transcript(payload.transcript, settings)
        updated_row = update_coach_methodology(
            payload.coach_id,
            extraction["methodology_playbook"],
            extraction["persona_system_prompt"],
            settings,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if updated_row is None:
        raise HTTPException(status_code=404, detail=f"Coach {payload.coach_id} not found")

    return MethodologyExtractionResponse(methodology_playbook=extraction["methodology_playbook"])
