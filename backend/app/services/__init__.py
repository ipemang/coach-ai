from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Optional
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from pydantic_settings import BaseSettings, SettingsConfigDict

from .scope import DataScope as DataScope
from .scope import apply_scope_query as apply_scope_query
from .scope import resolve_scope_from_env as resolve_scope_from_env

__all__ = ["Settings", "get_settings", "DataScope", "apply_scope_query", "resolve_scope_from_env"]


class Settings(BaseSettings):
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4-turbo"
    stripe_secret_key: Optional[str] = None
    supabase_url: Optional[str] = None
    supabase_service_role_key: Optional[str] = None
    organization_id: str = "1"
    coach_id: str = "1"
    whatsapp_access_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    whatsapp_webhook_secret: Optional[str] = None

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_file=".env",
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


METHODOLOGY_EXTRACTION_PROMPT = """You extract a coach's methodology from a raw voice memo transcript.

Use the Joe Friel master template as the organizing structure for the output. Infer the coach's system from the transcript, but do not invent details that are not supported by the source. If a detail is not present, use null, an empty string, or an empty array as appropriate.

Return JSON only with exactly these top-level keys:
{
  "methodology_playbook": {
    "coach_summary": "",
    "athlete_profile": {
      "ideal_athlete": "",
      "experience_level": "",
      "primary_goals": [],
      "constraints": []
    },
    "core_philosophy": {
      "summary": "",
      "principles": []
    },
    "periodization_model": {
      "structure": "",
      "phases": [],
      "progression_rules": []
    },
    "training_zones_and_intensity": {
      "zone_model": "",
      "intensity_distribution": "",
      "rules": []
    },
    "workout_design": {
      "session_types": [],
      "key_workouts": [],
      "weekly_structure": ""
    },
    "testing_and_monitoring": {
      "testing_protocols": [],
      "metrics": [],
      "adjustment_triggers": []
    },
    "recovery_and_load_management": {
      "recovery_rules": [],
      "fatigue_signals": [],
      "deload_strategy": ""
    },
    "nutrition_and_lifestyle": {
      "guidelines": [],
      "race_day": [],
      "non_training_factors": []
    },
    "communication_style": {
      "tone": "",
      "cadence": "",
      "coaching_voice": ""
    },
    "decision_rules": [],
    "non_negotiables": [],
    "open_questions": []
  },
  "persona_system_prompt": ""
}

The persona_system_prompt should be concise, written as a durable system prompt, and describe how this coach should plan, prioritize, and communicate with athletes.

Focus on endurance coaching concepts aligned with Joe Friel: assessment, goals, constraints, periodization, intensity balance, testing, recovery, race preparation, and athlete communication."""


def _request_json(url: str, method: str, headers: dict[str, str], payload: Any | None = None, timeout: int = 90) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(url, data=body, headers=headers, method=method)

    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8") if exc.fp else ""
        detail = error_body or exc.reason or "unknown error"
        raise RuntimeError(f"{method} {url} failed: {detail}") from exc


def _resolve_organization_id(organization_id: str | None, settings: Settings) -> str | None:
    if organization_id:
        return organization_id
    if settings.organization_id:
        return settings.organization_id
    return None


def _build_coach_url(resolved_settings: Settings, coach_id: str, organization_id: str | None = None) -> str:
    coach_id_filter = quote(coach_id, safe="")
    url = f"{resolved_settings.supabase_url.rstrip('/')}/rest/v1/coaches?coach_id=eq.{coach_id_filter}"
    if organization_id:
        organization_filter = quote(organization_id, safe="")
        url += f"&organization_id=eq.{organization_filter}"
    return url


def _build_methodologies_url(resolved_settings: Settings) -> str:
    return f"{resolved_settings.supabase_url.rstrip('/')}/rest/v1/methodologies?select=*"


def _extract_single_row(response: Any) -> dict[str, Any] | None:
    if isinstance(response, list):
        return response[0] if response else None
    if isinstance(response, dict):
        return response
    return None


def extract_methodology_from_transcript(transcript: str, settings: Settings | None = None) -> dict[str, Any]:
    resolved_settings = settings or get_settings()
    payload = {
        "model": resolved_settings.openai_model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": METHODOLOGY_EXTRACTION_PROMPT},
            {
                "role": "user",
                "content": f"Transcript:\n{transcript.strip()}\n\nExtract the methodology now.",
            },
        ],
    }

    if not resolved_settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    if not resolved_settings.supabase_url or not resolved_settings.supabase_service_role_key:
        raise RuntimeError("Supabase settings are not configured")

    response = _request_json(
        "https://api.openai.com/v1/chat/completions",
        "POST",
        {
            "Authorization": f"Bearer {resolved_settings.openai_api_key}",
            "Content-Type": "application/json",
        },
        payload,
    )

    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("LLM response did not include a JSON payload") from exc

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"LLM returned invalid JSON: {content}") from exc

    methodology_playbook = parsed.get("methodology_playbook")
    persona_system_prompt = parsed.get("persona_system_prompt")

    if not isinstance(methodology_playbook, dict):
        raise RuntimeError("LLM response missing methodology_playbook")
    if not isinstance(persona_system_prompt, str) or not persona_system_prompt.strip():
        raise RuntimeError("LLM response missing persona_system_prompt")

    return {
        "methodology_playbook": methodology_playbook,
        "persona_system_prompt": persona_system_prompt.strip(),
    }


def update_coach_methodology(
    coach_id: str,
    methodology_playbook: dict[str, Any],
    persona_system_prompt: str,
    settings: Settings | None = None,
    organization_id: str | None = None,
) -> dict[str, Any] | None:
    resolved_settings = settings or get_settings()
    resolved_organization_id = _resolve_organization_id(organization_id, resolved_settings)
    if not resolved_settings.supabase_url or not resolved_settings.supabase_service_role_key:
        raise RuntimeError("Supabase settings are not configured")
    url = _build_coach_url(resolved_settings, coach_id, resolved_organization_id)

    response = _request_json(
        url,
        "PATCH",
        {
            "apikey": resolved_settings.supabase_service_role_key,
            "Authorization": f"Bearer {resolved_settings.supabase_service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        {
            "methodology_playbook": methodology_playbook,
            "persona_system_prompt": persona_system_prompt,
        },
    )

    return _extract_single_row(response)


def persist_methodology_extraction(
    coach_id: str,
    methodology_playbook: dict[str, Any],
    persona_system_prompt: str,
    transcript: str,
    settings: Settings | None = None,
    organization_id: str | None = None,
) -> dict[str, Any]:
    resolved_settings = settings or get_settings()
    resolved_organization_id = _resolve_organization_id(organization_id, resolved_settings)
    if not resolved_settings.supabase_url or not resolved_settings.supabase_service_role_key:
        raise RuntimeError("Supabase settings are not configured")

    methodology_payload: dict[str, Any] = {
        "coach_id": coach_id,
        "methodology_playbook": methodology_playbook,
        "persona_system_prompt": persona_system_prompt,
        "transcript": transcript,
    }
    if resolved_organization_id:
        methodology_payload["organization_id"] = resolved_organization_id

    methodology_response = _request_json(
        _build_methodologies_url(resolved_settings),
        "POST",
        {
            "apikey": resolved_settings.supabase_service_role_key,
            "Authorization": f"Bearer {resolved_settings.supabase_service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        methodology_payload,
    )
    methodology_row = _extract_single_row(methodology_response)
    if methodology_row is None:
        raise RuntimeError("Methodology insert did not return a persisted row")

    updated_coach_row = update_coach_methodology(
        coach_id,
        methodology_playbook,
        persona_system_prompt,
        resolved_settings,
        organization_id=resolved_organization_id,
    )

    return {
        "methodology_row": methodology_row,
        "updated_coach_row": updated_coach_row,
    }
