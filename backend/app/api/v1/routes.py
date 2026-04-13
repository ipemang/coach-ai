from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.agents.check_in import AthleteCheckIn, CheckInRecommendation, assess_check_in, persist_check_in_state
from app.services import extract_methodology_from_transcript, get_settings, update_coach_methodology
from app.services.alert_service import AlertService
from app.services.athlete_memory_search import AthleteMemorySearchService

router = APIRouter()


class ExtractMethodologyRequest(BaseModel):
    coach_id: str = Field(..., min_length=1, description="Supabase coach_id for the coach record")
    transcript: str = Field(..., min_length=1, description="Voice memo transcript to extract methodology from")


class MethodologyExtractionResponse(BaseModel):
    methodology_playbook: dict[str, Any]


class AthleteMemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural-language memory search query")
    athlete_id: str | None = Field(default=None, description="Optional athlete_id filter")
    state_types: list[str] = Field(default_factory=list, description="Optional list of memory state types to restrict to")
    limit: int = Field(default=5, ge=1, le=25)


class AthleteMemorySearchResult(BaseModel):
    memory_state_id: str | None = None
    athlete_id: str | None = None
    athlete_name: str | None = None
    state_type: str | None = None
    updated_at: str | None = None
    score: float
    relevance_score: float
    recency_score: float
    context_score: float
    matched_terms: list[str] = Field(default_factory=list)
    excerpt: str | None = None
    memory_state: dict[str, Any] = Field(default_factory=dict)


class AthleteMemorySearchResponse(BaseModel):
    query: str
    result_count: int
    context: str
    results: list[AthleteMemorySearchResult]


@router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/check-in", tags=["athlete"], response_model=CheckInRecommendation)
async def check_in(request: Request, payload: AthleteCheckIn) -> CheckInRecommendation:
    recommendation = assess_check_in(payload)
    persist_check_in_state(payload, recommendation)

    alert_service = getattr(request.app.state, "alert_service", None)
    if alert_service is None:
        supabase_client = getattr(request.app.state, "supabase_client", None)
        whatsapp_service = getattr(request.app.state, "whatsapp_service", None)
        if supabase_client is not None or whatsapp_service is not None:
            alert_service = AlertService(supabase_client=supabase_client, whatsapp_service=whatsapp_service)

    if alert_service is not None and hasattr(alert_service, "process_check_in_submission"):
        try:
            await alert_service.process_check_in_submission(payload, recommendation)
        except Exception:
            pass

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


async def _resolve_supabase_client(request: Request) -> Any:
    supabase_client = getattr(request.app.state, "supabase_client", None)
    if supabase_client is not None:
        return supabase_client

    whatsapp_service = getattr(request.app.state, "whatsapp_service", None)
    if whatsapp_service is not None:
        candidate = getattr(whatsapp_service, "supabase_client", None)
        if candidate is not None:
            return candidate

    raise HTTPException(status_code=503, detail="Supabase client is not configured")


@router.post("/athlete-memory/search", tags=["athlete-memory"], response_model=AthleteMemorySearchResponse)
async def search_athlete_memory(request: Request, payload: AthleteMemorySearchRequest) -> AthleteMemorySearchResponse:
    supabase_client = await _resolve_supabase_client(request)
    service = AthleteMemorySearchService(supabase_client=supabase_client)
    results, context = await service.build_context(
        payload.query,
        athlete_id=payload.athlete_id,
        limit=payload.limit,
        state_types=payload.state_types or None,
    )
    response_results = [AthleteMemorySearchResult.model_validate(asdict(result)) for result in results]
    return AthleteMemorySearchResponse(
        query=payload.query,
        result_count=len(response_results),
        context=context,
        results=response_results,
    )
