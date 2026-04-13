from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.agents.check_in import AthleteCheckIn, CheckInRecommendation, assess_check_in, persist_check_in_state
from app.services import extract_methodology_from_transcript, get_settings, update_coach_methodology
from app.services.athletememorysearch import AthleteMemorySearch

router = APIRouter()


class ExtractMethodologyRequest(BaseModel):
    coach_id: str = Field(..., min_length=1, description="Supabase coach_id for the coach record")
    transcript: str = Field(..., min_length=1, description="Voice memo transcript to extract methodology from")


class MethodologyExtractionResponse(BaseModel):
    methodology_playbook: dict[str, Any]


class AthleteMemorySearchRequest(BaseModel):
    athlete_id: str = Field(..., min_length=1, description="Athlete id to search memories for")
    query: str | None = Field(default=None, description="Search query")
    limit: int = Field(default=5, ge=1, le=25, description="Maximum number of results to return")


class AthleteMemorySearchHitResponse(BaseModel):
    memory_state_id: str | None = None
    athlete_id: str
    state_type: str | None = None
    updated_at: str | None = None
    score: float
    summary: str
    snippet: str
    memory_state: dict[str, Any] = Field(default_factory=dict)


class AthleteMemorySearchResponse(BaseModel):
    athlete_id: str
    query: str
    total_scanned: int
    used_fallback: bool
    matches: list[AthleteMemorySearchHitResponse]


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


@router.post("/athlete-memory-search", tags=["rag"], response_model=AthleteMemorySearchResponse)
async def athlete_memory_search(request: Request, payload: AthleteMemorySearchRequest) -> AthleteMemorySearchResponse:
    supabase_client = getattr(request.app.state, "supabase_client", None)
    if supabase_client is None:
        raise HTTPException(status_code=503, detail="Supabase client is not configured")

    search_service = AthleteMemorySearch(supabase_client)
    result = await search_service.search(payload.athlete_id, payload.query, limit=payload.limit)
    return AthleteMemorySearchResponse(
        athlete_id=result.athlete_id,
        query=result.query,
        total_scanned=result.total_scanned,
        used_fallback=result.used_fallback,
        matches=[AthleteMemorySearchHitResponse.model_validate(asdict(hit)) for hit in result.matches],
    )
