from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.agents.check_in import AthleteCheckIn, CheckInRecommendation, assess_check_in, persist_check_in_state
from app.core.security import AuthenticatedPrincipal, require_roles, resolve_coach_scope
from app.core.config import get_settings
from app.services.methodology_extractor import (extract_methodology_from_transcript, persist_methodology_extraction)
from app.services.athlete_memory_search import AthleteMemorySearchService
from app.services.scope import DataScope

router = APIRouter()


class ExtractMethodologyRequest(BaseModel):
    coach_id: str = Field(..., min_length=1, description="Supabase coach_id for the coach record")
    organization_id: str = Field(..., min_length=1, description="Organization scope for the coach record")
    transcript: str = Field(..., min_length=1, description="Voice memo transcript to extract methodology from")


class MethodologyExtractionResponse(BaseModel):
    methodology_playbook: dict[str, Any]
    methodology_id: str | None = None
    coach_updated: bool = False


class AthleteMemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural-language memory search query")
    organization_id: str = Field(..., min_length=1, description="Organization scope for the search")
    coach_id: str = Field(..., min_length=1, description="Coach scope for the search")
    athlete_id: str | None = None
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
def check_in(
    request: Request,
    payload: AthleteCheckIn,
    principal: AuthenticatedPrincipal = Depends(require_roles("authenticated", "athlete", "coach", "admin")),
) -> CheckInRecommendation:
    recommendation = assess_check_in(payload)
    scope = getattr(request.app.state, "scope", None)
    if principal.organization_id or principal.coach_id:
        scope = DataScope(
            organization_id=principal.organization_id or getattr(request.app.state, "organization_id", None),
            coach_id=principal.coach_id or getattr(request.app.state, "coach_id", None),
        )
    persist_check_in_state(
        payload,
        recommendation,
        organization_id=scope.organization_id if scope and scope.is_configured() else None,
        coach_id=scope.coach_id if scope and scope.is_configured() else None,
    )
    return recommendation


@router.post("/extract-methodology", tags=["methodology"], response_model=MethodologyExtractionResponse)
def extract_methodology(
    request: Request,
    payload: ExtractMethodologyRequest,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
) -> MethodologyExtractionResponse:
    settings = get_settings()
    scope = resolve_coach_scope(
        principal,
        organization_id=payload.organization_id,
        coach_id=payload.coach_id,
        fallback_scope=getattr(request.app.state, "scope", None),
    )

    try:
        extraction = extract_methodology_from_transcript(payload.transcript, settings)
        persisted = persist_methodology_extraction(
            scope.coach_id or payload.coach_id,
            extraction["methodology_playbook"],
            extraction["persona_system_prompt"],
            payload.transcript,
            settings,
            organization_id=scope.organization_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return MethodologyExtractionResponse(
        methodology_playbook=extraction["methodology_playbook"],
        methodology_id=persisted["methodology_row"].get("id"),
        coach_updated=persisted["updated_coach_row"] is not None,
    )


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
    service = AthleteMemorySearchService(
        supabase_client=supabase_client,
        scope=DataScope(organization_id=payload.organization_id, coach_id=payload.coach_id),
    )
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
