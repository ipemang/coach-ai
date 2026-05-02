"""Passive token usage logger — COA-71.

Writes one row to usage_events after every LLM call. Non-blocking: failures
are logged as warnings and never propagate to the caller. Zero enforcement —
this is telemetry only until COA-70 (metering enforcement) is built.

Usage:
    from app.services.usage_logger import UsageLogger
    from app.services.llm_client import LLMResponse

    response: LLMResponse = llm.chat_completions(system=..., user=...)

    await UsageLogger.log(
        supabase=request.app.state.supabase_client,
        response=response,
        event_type="plan_gen",
        coach_id=principal.coach_id,
        endpoint="/api/v1/coach/plan/generate",
    )

The `log` call is fire-and-forget: await it, but if it throws, the upstream
request already succeeded. Add it at the END of every LLM-calling endpoint.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.services.llm_client import LLMResponse

logger = logging.getLogger(__name__)

# ── Cost lookup table (USD per 1M tokens) ─────────────────────────────────────
# Keep this updated as we switch models or negotiate pricing.
# Source: Groq pricing page — https://console.groq.com/settings/limits
_COST_PER_1M: dict[str, dict[str, float]] = {
    # model-name-fragment → {input, output} cost per 1M tokens in USD
    "llama-3.1-70b": {"input": 0.59, "output": 0.79},
    "llama-3.1-8b":  {"input": 0.05, "output": 0.08},
    "llama3-70b":    {"input": 0.59, "output": 0.79},
    "llama3-8b":     {"input": 0.05, "output": 0.08},
    "mixtral-8x7b":  {"input": 0.24, "output": 0.24},
    "mistral-7b":    {"input": 0.06, "output": 0.06},
    "gemma2-9b":     {"input": 0.20, "output": 0.20},
}

_FALLBACK_COST = {"input": 0.10, "output": 0.10}  # conservative unknown-model estimate


def _estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate USD cost for a single LLM call based on model name substring match."""
    model_lower = model.lower()
    rates = _FALLBACK_COST
    for fragment, cost_rates in _COST_PER_1M.items():
        if fragment in model_lower:
            rates = cost_rates
            break
    cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
    return round(cost, 8)


class UsageLogger:
    """Static helper — no instantiation needed."""

    @staticmethod
    async def log(
        *,
        supabase: Any,
        response: LLMResponse,
        event_type: str,
        coach_id: str | None = None,
        athlete_id: str | None = None,
        endpoint: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        """Fire-and-forget: log token usage to usage_events.

        Args:
            supabase:    The app's Supabase client (service role).
            response:    The LLMResponse from llm_client.chat_completions().
            event_type:  One of: 'chat', 'plan_gen', 'analysis',
                         'interaction_wrap', 'post_workout_analysis',
                         'checkin_reply', 'voice_stt'.
            coach_id:    UUID string of the coach (or None for system calls).
            athlete_id:  UUID string of the relevant athlete if applicable.
            endpoint:    The FastAPI route that triggered this call.
            metadata:    Any extra context (prompt template, athlete count, etc.)
        """
        # Run in background — don't await the DB write on the hot path
        asyncio.create_task(
            UsageLogger._write(
                supabase=supabase,
                response=response,
                event_type=event_type,
                coach_id=coach_id,
                athlete_id=athlete_id,
                endpoint=endpoint,
                metadata=metadata or {},
            )
        )

    @staticmethod
    async def _write(
        *,
        supabase: Any,
        response: LLMResponse,
        event_type: str,
        coach_id: str | None,
        athlete_id: str | None,
        endpoint: str | None,
        metadata: dict,
    ) -> None:
        """Actual DB write — called via create_task so failures don't propagate."""
        try:
            cost = _estimate_cost_usd(
                response.model, response.input_tokens, response.output_tokens
            )
            row: dict[str, Any] = {
                "event_type":     event_type,
                "model":          response.model,
                "input_tokens":   response.input_tokens,
                "output_tokens":  response.output_tokens,
                "cost_usd":       cost,
                "latency_ms":     response.latency_ms,
                "endpoint":       endpoint,
                "metadata":       metadata,
            }
            if coach_id:
                row["coach_id"] = coach_id
            if athlete_id:
                row["athlete_id"] = athlete_id

            supabase.table("usage_events").insert(row).execute()

            logger.debug(
                "[usage] %s | %s | in=%d out=%d | $%.6f | %dms",
                event_type,
                response.model,
                response.input_tokens,
                response.output_tokens,
                cost,
                response.latency_ms,
            )
        except Exception:
            # Never raise — this is background telemetry
            logger.warning(
                "[usage] Failed to log usage event (non-fatal)",
                exc_info=True,
            )

    @staticmethod
    def log_sync(
        *,
        supabase: Any,
        response: LLMResponse,
        event_type: str,
        coach_id: str | None = None,
        athlete_id: str | None = None,
        endpoint: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        """Synchronous variant for non-async contexts (e.g. background tasks).

        Swallows all exceptions.
        """
        try:
            cost = _estimate_cost_usd(
                response.model, response.input_tokens, response.output_tokens
            )
            row: dict[str, Any] = {
                "event_type":    event_type,
                "model":         response.model,
                "input_tokens":  response.input_tokens,
                "output_tokens": response.output_tokens,
                "cost_usd":      cost,
                "latency_ms":    response.latency_ms,
                "endpoint":      endpoint,
                "metadata":      metadata or {},
            }
            if coach_id:
                row["coach_id"] = coach_id
            if athlete_id:
                row["athlete_id"] = athlete_id

            supabase.table("usage_events").insert(row).execute()
        except Exception:
            logger.warning("[usage] Failed to log usage event (sync, non-fatal)", exc_info=True)
