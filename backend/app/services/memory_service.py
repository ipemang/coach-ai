"""COA-82: Athlete memory layer.

Append-only event log + rolling LLM-consolidated summary so the AI pipeline
has persistent context across WhatsApp conversations.

Three public methods:
  append_event()     — insert one event row (fast, no LLM)
  get_recent_events() — fetch last N events for context injection
  refresh_summary()  — consolidate last 50 events into a ~300-word rolling
                       summary written back to athletes.memory_summary
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

_SUMMARY_SYSTEM = """You are a coaching memory assistant. You receive a chronological log of
interactions with an endurance athlete and must produce a concise, structured memory summary
that a coaching AI can use as context in future conversations.

Write 200-300 words covering:
- Athlete's recent training patterns and performance trends
- Recurring complaints, injuries, or areas of concern
- Goals, motivators, and emotional state trends
- Any key decisions or adjustments the coach has made
- Anything unusual or flag-worthy

Write in third person ("The athlete..."). Be specific and data-driven. Do not pad."""


class MemoryService:
    def __init__(self, supabase: Any, llm: LLMClient | None = None) -> None:
        self._db = supabase
        self._llm = llm or LLMClient()

    def append_event(
        self,
        athlete_id: str,
        event_type: str,
        content: str,
        metadata: dict | None = None,
    ) -> str | None:
        """Insert one event into athlete_memory_events. Returns the new row id or None."""
        try:
            result = self._db.table("athlete_memory_events").insert({
                "athlete_id": athlete_id,
                "event_type": event_type,
                "content": content[:4000],
                "metadata": metadata or {},
            }).execute()
            row_id = result.data[0].get("id") if result.data else None
            logger.info("[memory] Appended %s event for athlete=%s id=%s", event_type, athlete_id[:8], row_id)
            return row_id
        except Exception as exc:
            logger.warning("[memory] Failed to append event for athlete=%s: %s", athlete_id[:8], exc)
            return None

    def get_recent_events(self, athlete_id: str, limit: int = 20) -> list[dict]:
        """Return the last `limit` events newest-first."""
        try:
            result = self._db.table("athlete_memory_events").select(
                "event_type, content, metadata, created_at"
            ).eq("athlete_id", athlete_id).order(
                "created_at", desc=True
            ).limit(limit).execute()
            return result.data or []
        except Exception as exc:
            logger.warning("[memory] Failed to fetch events for athlete=%s: %s", athlete_id[:8], exc)
            return []

    def get_summary(self, athlete_id: str) -> str:
        """Return current memory_summary from athletes table, or empty string."""
        try:
            result = self._db.table("athletes").select(
                "memory_summary"
            ).eq("id", athlete_id).single().execute()
            return (result.data or {}).get("memory_summary") or ""
        except Exception as exc:
            logger.warning("[memory] Failed to fetch summary for athlete=%s: %s", athlete_id[:8], exc)
            return ""

    def refresh_summary(self, athlete_id: str) -> bool:
        """Consolidate the last 50 events into a rolling summary via LLM.

        Writes the result to athletes.memory_summary. Returns True on success.
        Designed to be called fire-and-forget (FastAPI BackgroundTasks).
        """
        try:
            events = self.get_recent_events(athlete_id, limit=50)
            if not events:
                logger.info("[memory] No events to summarize for athlete=%s", athlete_id[:8])
                return False

            # Build chronological transcript (oldest first for the LLM)
            lines = []
            for ev in reversed(events):
                ts = str(ev.get("created_at") or "")[:16]
                etype = ev.get("event_type", "event")
                content = ev.get("content", "")[:500]
                lines.append(f"[{ts}] {etype.upper()}: {content}")
            transcript = "\n".join(lines)

            response = self._llm.chat_completions(
                system=_SUMMARY_SYSTEM,
                user=f"Athlete ID: {athlete_id}\n\nInteraction log:\n{transcript}\n\nWrite the memory summary:",
            )
            summary = response.content.strip()
            if not summary:
                return False

            self._db.table("athletes").update({
                "memory_summary": summary,
            }).eq("id", athlete_id).execute()

            logger.info(
                "[memory] Refreshed summary for athlete=%s — %d chars, %d tokens used",
                athlete_id[:8], len(summary), response.output_tokens,
            )
            return True

        except Exception as exc:
            logger.warning("[memory] refresh_summary failed for athlete=%s: %s", athlete_id[:8], exc)
            return False


__all__ = ["MemoryService"]
