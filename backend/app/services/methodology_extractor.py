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


@dataclass(slots=True)
class MethodologyExtractionResult:
    playbook: dict[str, Any]
    provider: str
    model: str
    extracted_at: str


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
        user_prompt = self.build_user_prompt(request)
        raw = self.llm_client.chat_completions(system=SYSTEM_PROMPT, user=user_prompt)
        playbook = self._parse_json(raw)
        return MethodologyExtractionResult(
            playbook=playbook,
            provider=self.llm_client.config.provider,
            model=self.llm_client.config.model,
            extracted_at=datetime.now(timezone.utc).isoformat(),
        )

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
