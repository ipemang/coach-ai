"""API route for transcript methodology extraction."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..core.security import AuthenticatedPrincipal, require_roles, resolve_coach_scope
from ..core.config import get_settings
from ..services.methodology_extractor import persist_methodology_extraction
from ..services.methodology_extractor import MethodologyExtractionRequest, MethodologyExtractor
from ..services.usage_logger import UsageLogger
from ..services.llm_client import LLMResponse


router = APIRouter()
extractor = MethodologyExtractor()


def _build_persona_system_prompt(playbook: dict[str, Any]) -> str:
    summary = str(playbook.get("source_summary") or playbook.get("playbook_name") or "Coach methodology").strip()
    methodology = playbook.get("joe_friel_methodology") if isinstance(playbook.get("joe_friel_methodology"), dict) else {}
    principles = methodology.get("principles") if isinstance(methodology, dict) else []
    execution_rules = methodology.get("execution_rules") if isinstance(methodology, dict) else []

    parts = [summary]
    if isinstance(principles, list) and principles:
        parts.append("Principles: " + "; ".join(str(item) for item in principles if item))
    if isinstance(execution_rules, list) and execution_rules:
        parts.append("Execution rules: " + "; ".join(str(item) for item in execution_rules if item))
    parts.append("Plan conservatively, prioritize evidence-supported decisions, and communicate clearly and directly with athletes.")
    return " ".join(parts).strip()


class TranscriptExtractionInput(BaseModel):
    transcript: str | None = Field(default=None, description="Primary transcript text")
    transcripts: list[str] = Field(default_factory=list, description="Additional transcript segments")
    athlete_name: str | None = Field(default=None)
    sport: str | None = Field(default=None)
    event: str | None = Field(default=None)
    notes: str | None = Field(default=None)
    coach_id: str | None = Field(default=None, description="Optional coach_id to persist the extraction against")
    organization_id: str | None = Field(default=None, description="Optional organization scope used when persisting")


class TranscriptExtractionOutput(BaseModel):
    playbook: dict[str, Any]
    provider: str
    model: str
    extracted_at: str
    status: str
    warnings: list[str] = Field(default_factory=list)
    missing_context: list[str] = Field(default_factory=list)
    methodology_id: str | None = None
    coach_updated: bool | None = None


@router.post("/extract-methodology", response_model=TranscriptExtractionOutput, response_model_exclude_none=True)
def extract_methodology(
    request: Request,
    payload: TranscriptExtractionInput,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
) -> TranscriptExtractionOutput:
    request_scope = getattr(request.app.state, "scope", None)
    extraction_request = MethodologyExtractionRequest(
        transcript=payload.transcript,
        transcripts=payload.transcripts,
        athlete_name=payload.athlete_name,
        sport=payload.sport,
        event=payload.event,
        notes=payload.notes,
    )
    methodology_id = None
    coach_updated = None

    try:
        result = extractor.extract(extraction_request)

        # COA-71: passive token logging — fire-and-forget, non-fatal
        if result.input_tokens or result.output_tokens:
            supabase = getattr(request.app.state, "supabase_client", None)
            if supabase:
                UsageLogger.log_sync(
                    supabase=supabase,
                    response=LLMResponse(
                        content="",  # not stored
                        input_tokens=result.input_tokens,
                        output_tokens=result.output_tokens,
                        model=result.model,
                        latency_ms=result.latency_ms,
                    ),
                    event_type="analysis",
                    coach_id=payload.coach_id or getattr(principal, "coach_id", None),
                    endpoint="/api/v1/methodology/extract-methodology",
                    metadata={"sport": payload.sport, "event": payload.event},
                )

        combined_transcript = extraction_request.combined_transcript()
        if payload.coach_id and combined_transcript:
            scope = resolve_coach_scope(
                principal,
                organization_id=payload.organization_id,
                coach_id=payload.coach_id,
                fallback_scope=request_scope,
            )
            settings = get_settings()
            persisted = persist_methodology_extraction(
                scope.coach_id or payload.coach_id,
                result.playbook,
                _build_persona_system_prompt(result.playbook),
                combined_transcript,
                settings,
                organization_id=scope.organization_id,
            )
            methodology_id = persisted["methodology_row"].get("id")
            coach_updated = persisted["updated_coach_row"] is not None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return TranscriptExtractionOutput(
        playbook=result.playbook,
        provider=result.provider,
        model=result.model,
        extracted_at=result.extracted_at,
        status=result.status,
        warnings=result.warnings,
        missing_context=result.missing_context,
        methodology_id=methodology_id,
        coach_updated=coach_updated,
    )
