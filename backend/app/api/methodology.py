"""API route for transcript methodology extraction."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.methodology_extractor import MethodologyExtractionRequest, MethodologyExtractor


router = APIRouter()
extractor = MethodologyExtractor()


class TranscriptExtractionInput(BaseModel):
    transcript: str | None = Field(default=None, description="Primary transcript text")
    transcripts: list[str] = Field(default_factory=list, description="Additional transcript segments")
    athlete_name: str | None = Field(default=None)
    sport: str | None = Field(default=None)
    event: str | None = Field(default=None)
    notes: str | None = Field(default=None)


class TranscriptExtractionOutput(BaseModel):
    playbook: dict[str, Any]
    provider: str
    model: str
    extracted_at: str


@router.post("/extract-methodology", response_model=TranscriptExtractionOutput)
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
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TranscriptExtractionOutput(
        playbook=result.playbook,
        provider=result.provider,
        model=result.model,
        extracted_at=result.extracted_at,
    )
