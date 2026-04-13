"""API route for transcript methodology extraction."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services import get_settings, persist_methodology_extraction
from ..services.methodology_extractor import MethodologyExtractionRequest, MethodologyExtractor


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
def extract_methodology(payload: TranscriptExtractionInput) -> TranscriptExtractionOutput:
    request = MethodologyExtractionRequest(
        transcript=payload.transcript,
        transcripts=payload.transcripts,
        athlete_name=payload.athlete_name,
        sport=payload.sport,
        event=payload.event,
        notes=payload.notes,
    )
    try:
        result = extractor.extract(request)
        methodology_id = None
        coach_updated = None
        combined_transcript = request.combined_transcript()
        if payload.coach_id and combined_transcript:
            settings = get_settings()
            persisted = persist_methodology_extraction(
                payload.coach_id,
                result.playbook,
                _build_persona_system_prompt(result.playbook),
                combined_transcript,
                settings,
                organization_id=payload.organization_id,
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
