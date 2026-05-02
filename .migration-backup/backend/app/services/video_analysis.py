"""COA-73: Video / frame analysis pipeline for endurance sports coaching.

Accepts up to 4 frame image URLs, sends them to the vision LLM, and returns
structured technique feedback scoped to the athlete's discipline.

V1 scope: frame-based analysis only (no video decoding). Callers are
responsible for extracting frames before calling this service.
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from app.services.llm_client import LLMClient, LLMConfig, LLMClientError

logger = logging.getLogger(__name__)

# ── Data model ────────────────────────────────────────────────────────────────

@dataclass(slots=True)
class VideoAnalysisResult:
    discipline: str
    form_score: int                      # 0–100
    strengths: list[str]
    issues: list[str]
    recommendations: list[str]
    raw_analysis: str
    frame_count: int
    latency_ms: int
    model: str
    input_tokens: int
    output_tokens: int


# ── Prompts ───────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an elite endurance sports biomechanics analyst with 20 years of experience
coaching triathletes, runners, and cyclists. You analyze video frames to identify technique strengths,
form issues, and actionable corrections. You are precise, evidence-based, and focused on injury
prevention and performance gains.

Always respond in valid JSON with this exact structure:
{
  "form_score": <integer 0-100>,
  "strengths": ["<observation>", ...],
  "issues": ["<issue with brief explanation>", ...],
  "recommendations": ["<specific, actionable correction>", ...],
  "summary": "<2-3 sentence coaching note>"
}

form_score rubric:
- 90-100: Elite technique, race-ready
- 70-89:  Good technique, minor adjustments needed
- 50-69:  Moderate issues, meaningful gains available
- 30-49:  Significant technique flaws, injury risk
- 0-29:   Serious form breakdown, immediate correction required

Keep all lists to 3-5 items maximum. Be specific — "heel striking 10cm in front of center of mass"
is more useful than "heel striking"."""


_USER_PROMPT_TEMPLATE = """Analyze the {discipline} technique shown in the attached frame(s).

Athlete context:
- Discipline: {discipline}
- Target event: {target_race}
- Training level: {training_level}
{extra_notes}

Provide your structured JSON analysis focusing on the most impactful observations.
Do not invent issues that are not visible in the frames — only report what you can clearly see."""


_DISCIPLINE_MAP = {
    "run": "running",
    "running": "running",
    "bike": "cycling",
    "cycling": "cycling",
    "swim": "swimming",
    "swimming": "swimming",
    "triathlon": "triathlon",
    "strength": "strength training",
}


def _normalize_discipline(raw: str) -> str:
    return _DISCIPLINE_MAP.get(raw.lower().strip(), raw.strip())


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON from the LLM response, tolerating markdown fences."""
    text = text.strip()
    # Strip ```json ... ``` fences
    fenced = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fenced:
        text = fenced.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Last-ditch: find the first {...} block
        match = re.search(r"\{[\s\S]+\}", text)
        if match:
            return json.loads(match.group(0))
        raise


# ── Service ───────────────────────────────────────────────────────────────────

class VideoAnalysisService:
    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self._client = llm_client or LLMClient(LLMConfig())

    def analyze_frames(
        self,
        *,
        frame_urls: list[str],
        discipline: str,
        athlete_profile: dict[str, Any] | None = None,
        coach_notes: str | None = None,
    ) -> VideoAnalysisResult:
        """Analyze athlete form from 1–4 frame images.

        Args:
            frame_urls:       Public image URLs (JPEG/PNG). Max 4 used.
            discipline:       Sport discipline (run, bike, swim, triathlon).
            athlete_profile:  Athlete stable_profile dict for context (optional).
            coach_notes:      Free-text notes from the coach to focus the analysis.

        Returns:
            VideoAnalysisResult with structured feedback.

        Raises:
            LLMClientError: on LLM failure.
            ValueError:     on invalid inputs.
        """
        if not frame_urls:
            raise ValueError("At least one frame URL is required")
        if not discipline:
            raise ValueError("Discipline is required")

        frames = [url.strip() for url in frame_urls if url.strip()][:4]
        norm_discipline = _normalize_discipline(discipline)
        profile = athlete_profile or {}

        target_race = profile.get("target_race") or "not specified"
        weekly_hours = profile.get("max_weekly_hours") or "not specified"
        training_level = f"{weekly_hours} hours/week" if weekly_hours != "not specified" else "not specified"
        extra_notes = f"- Coach notes: {coach_notes}" if coach_notes else ""

        user_prompt = _USER_PROMPT_TEMPLATE.format(
            discipline=norm_discipline,
            target_race=target_race,
            training_level=training_level,
            extra_notes=extra_notes,
        )

        t0 = time.monotonic()
        response = self._client.chat_completions(
            system=_SYSTEM_PROMPT,
            user=user_prompt,
            image_urls=frames,
        )
        latency_ms = int((time.monotonic() - t0) * 1000)

        try:
            parsed = _extract_json(response.content)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("[COA-73] Failed to parse LLM JSON response: %s | raw: %.200s", exc, response.content)
            # Return a graceful degraded result with the raw text
            return VideoAnalysisResult(
                discipline=norm_discipline,
                form_score=0,
                strengths=[],
                issues=[],
                recommendations=[],
                raw_analysis=response.content,
                frame_count=len(frames),
                latency_ms=latency_ms,
                model=response.model,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )

        return VideoAnalysisResult(
            discipline=norm_discipline,
            form_score=int(parsed.get("form_score", 0)),
            strengths=[str(s) for s in parsed.get("strengths", [])],
            issues=[str(i) for i in parsed.get("issues", [])],
            recommendations=[str(r) for r in parsed.get("recommendations", [])],
            raw_analysis=parsed.get("summary", response.content),
            frame_count=len(frames),
            latency_ms=latency_ms,
            model=response.model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )


__all__ = ["VideoAnalysisService", "VideoAnalysisResult"]
