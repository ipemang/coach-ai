"""Transcript-to-Joe Friel playbook extraction service."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .llm_client import LLMClient, LLMClientError


SYSTEM_PROMPT = """You convert coaching transcripts into structured Joe Friel-style training playbooks.

Rules:
- Output strict JSON only. No markdown, no commentary, no code fences.
- Preserve only claims supported by the transcript. If the transcript does not support a field, use null or an empty array/object as appropriate.
- Prefer concise, operational guidance over prose.
- Organize the result as a playbook that a coach could execute.
- Use Joe Friel training concepts when they are relevant: specificity, periodization, progression, recovery, testing, durability, and race-specific preparation.
- When the transcript implies a periodization structure, normalize it into named phases.
- Include evidence snippets for the key decisions so the output remains auditable.

Target schema:
{
  "playbook_name": string,
  "source_summary": string,
  "athlete_profile": {
    "sport": string|null,
    "event": string|null,
    "goals": [string],
    "constraints": [string],
    "experience_level": string|null,
    "timeline": string|null
  },
  "joe_friel_methodology": {
    "principles": [string],
    "periodization": [
      {
        "phase": string,
        "duration": string|null,
        "purpose": string|null,
        "key_sessions": [string],
        "intensity_focus": [string],
        "notes": [string]
      }
    ],
    "weekly_structure": {
      "anchor_workouts": [string],
      "recovery_logic": [string],
      "long_session": string|null,
      "testing": [string]
    },
    "execution_rules": [string]
  },
  "recommended_next_steps": [string],
  "follow_up_questions": [string],
  "evidence": [
    {
      "claim": string,
      "snippet": string
    }
  ],
  "confidence": number
}
"""


@dataclass(slots=True)
class MethodologyExtractionRequest:
    transcript: str | None = None
    transcripts: list[str] = field(default_factory=list)
    athlete_name: str | None = None
    sport: str | None = None
    event: str | None = None
    notes: str | None = None

    def combined_transcript(self) -> str:
        parts: list[str] = []
        if self.transcript and self.transcript.strip():
            parts.append(self.transcript.strip())
        for transcript in self.transcripts:
            if transcript and transcript.strip():
                parts.append(transcript.strip())
        return "\n\n".join(parts).strip()

    def missing_context_fields(self) -> list[str]:
        missing: list[str] = []
        if not self.athlete_name or not self.athlete_name.strip():
            missing.append("athlete_name")
        if not self.sport or not self.sport.strip():
            missing.append("sport")
        if not self.event or not self.event.strip():
            missing.append("event")
        if not self.notes or not self.notes.strip():
            missing.append("notes")
        return missing


@dataclass(slots=True)
class MethodologyExtractionResult:
    playbook: dict[str, Any]
    provider: str
    model: str
    extracted_at: str
    status: str = "complete"
    warnings: list[str] = field(default_factory=list)
    missing_context: list[str] = field(default_factory=list)


class MethodologyExtractor:
    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self.llm_client = llm_client or LLMClient()

    def build_user_prompt(self, request: MethodologyExtractionRequest) -> str:
        transcript = request.combined_transcript()
        if not transcript:
            raise ValueError("A transcript is required")

        context = {
            "athlete_name": request.athlete_name,
            "sport": request.sport,
            "event": request.event,
            "notes": request.notes,
        }
        return (
            "Convert the following transcript into the target JSON schema.\n\n"
            f"Context: {json.dumps(context, ensure_ascii=False)}\n\n"
            f"Transcript:\n{transcript}"
        )

    def extract(self, request: MethodologyExtractionRequest) -> MethodologyExtractionResult:
        missing_context = request.missing_context_fields()
        transcript = request.combined_transcript()
        extracted_at = datetime.now(timezone.utc).isoformat()

        if not transcript:
            return self._build_fallback_result(
                request=request,
                extracted_at=extracted_at,
                status="incomplete",
                warnings=["No transcript was provided."] + self._missing_context_warning(missing_context),
                missing_context=missing_context,
            )

        try:
            user_prompt = self.build_user_prompt(request)
            raw = self.llm_client.chat_completions(system=SYSTEM_PROMPT, user=user_prompt)
            playbook = self._parse_json(raw)
        except LLMClientError as exc:
            return self._build_fallback_result(
                request=request,
                extracted_at=extracted_at,
                status="pending",
                warnings=[str(exc)] + self._missing_context_warning(missing_context),
                missing_context=missing_context,
            )
        except ValueError as exc:
            return self._build_fallback_result(
                request=request,
                extracted_at=extracted_at,
                status="incomplete",
                warnings=[str(exc)] + self._missing_context_warning(missing_context),
                missing_context=missing_context,
            )

        return MethodologyExtractionResult(
            playbook=playbook,
            provider=self.llm_client.config.provider,
            model=self.llm_client.config.model,
            extracted_at=extracted_at,
            status="complete" if not missing_context else "incomplete",
            warnings=self._missing_context_warning(missing_context),
            missing_context=missing_context,
        )

    def _build_fallback_result(
        self,
        *,
        request: MethodologyExtractionRequest,
        extracted_at: str,
        status: str,
        warnings: list[str],
        missing_context: list[str],
    ) -> MethodologyExtractionResult:
        return MethodologyExtractionResult(
            playbook=self._build_fallback_playbook(request, status=status, warnings=warnings, missing_context=missing_context),
            provider=self.llm_client.config.provider,
            model=self.llm_client.config.model,
            extracted_at=extracted_at,
            status=status,
            warnings=self._dedupe_strings(warnings),
            missing_context=missing_context,
        )

    def _build_fallback_playbook(
        self,
        request: MethodologyExtractionRequest,
        *,
        status: str,
        warnings: list[str],
        missing_context: list[str],
    ) -> dict[str, Any]:
        summary_bits = [
            bit
            for bit in (
                f"Athlete: {request.athlete_name}" if request.athlete_name else None,
                f"Sport: {request.sport}" if request.sport else None,
                f"Event: {request.event}" if request.event else None,
            )
            if bit
        ]
        source_summary = "; ".join(summary_bits) if summary_bits else "Transcript extraction is waiting on required context."
        if status == "pending":
            source_summary = "Transcript extraction is pending because the coach response is not ready yet."

        return {
            "playbook_name": "Pending transcript review" if status != "complete" else "Coach playbook",
            "source_summary": source_summary,
            "athlete_profile": {
                "sport": request.sport,
                "event": request.event,
                "goals": [],
                "constraints": [],
                "experience_level": None,
                "timeline": None,
            },
            "joe_friel_methodology": {
                "principles": [],
                "periodization": [],
                "weekly_structure": {
                    "anchor_workouts": [],
                    "recovery_logic": warnings,
                    "long_session": None,
                    "testing": [],
                },
                "execution_rules": [
                    "Proceed only with explicit information that is available.",
                    "Mark the output incomplete when required context is missing.",
                    "Keep the coach path visible until the response is confirmed.",
                ],
            },
            "recommended_next_steps": [
                "Provide the missing context and rerun extraction.",
                "Wait for the coach response before sending an unverified recommendation." if status == "pending" else "Review the transcript for any missing details before publishing.",
            ],
            "follow_up_questions": self._build_follow_up_questions(missing_context),
            "evidence": [],
            "confidence": 0.0,
        }

    @staticmethod
    def _build_follow_up_questions(missing_context: list[str]) -> list[str]:
        if not missing_context:
            return []
        questions: list[str] = []
        for field_name in missing_context:
            questions.append(f"What is the athlete's {field_name.replace('_', ' ')}?")
        return questions

    @staticmethod
    def _missing_context_warning(missing_context: list[str]) -> list[str]:
        if not missing_context:
            return []
        return [f"Missing context: {', '.join(missing_context)}."]

    @staticmethod
    def _dedupe_strings(values: list[str]) -> list[str]:
        deduped: list[str] = []
        for value in values:
            if value and value not in deduped:
                deduped.append(value)
        return deduped

    @staticmethod
    def _parse_json(raw: str) -> dict[str, Any]:
        candidate = raw.strip()
        if candidate.startswith("```"):
            candidate = candidate.removeprefix("```json").removeprefix("```").strip()
            if candidate.endswith("```"):
                candidate = candidate[:-3].strip()
        if not candidate.startswith("{"):
            start = candidate.find("{")
            end = candidate.rfind("}")
            if start >= 0 and end > start:
                candidate = candidate[start : end + 1]
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise LLMClientError(f"LLM response was not valid JSON: {candidate[:500]}") from exc
        if not isinstance(parsed, dict):
            raise LLMClientError("LLM response JSON must be an object")
        return parsed


__all__ = [
    "MethodologyExtractionRequest",
    "MethodologyExtractionResult",
    "MethodologyExtractor",
    "SYSTEM_PROMPT",
]
