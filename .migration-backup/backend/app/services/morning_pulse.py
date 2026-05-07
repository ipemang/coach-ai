"""
COA-103: Morning pulse — daily structured WhatsApp check-in service.

Handles the 3-question sequential check-in flow:
  1. Scheduler fires → sends Q1, sets current_state.morning_pulse_state
  2. Athlete replies → save answer → send Q2 (or Q3, or summary)
  3. After all 3 answers → generate AI summary → persist session → clear state

State schema (stored in athletes.current_state under key "morning_pulse_state"):
  {
    "session_id": "<uuid>",
    "questions": ["Q1 text", "Q2 text", "Q3 text"],
    "answers": [],           # fills as athlete replies
    "q_idx": 1,             # which question we sent (1-based); next reply answers this
    "started_at": "<ISO>"   # used to expire sessions that never complete
  }
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

DEFAULT_QUESTIONS: list[str] = [
    "How are your legs feeling today? (1 = very sore, 10 = fresh)",
    "How did you sleep last night? (1 = very poor, 10 = excellent)",
    "Any pain, niggles, or anything your coach should know about?",
]

SESSION_EXPIRY_HOURS = 2  # abandon state after 2 hours of no reply


# ── State helpers ──────────────────────────────────────────────────────────────

def is_session_active(pulse_state: dict) -> bool:
    """Return True if the pulse state is valid and not expired."""
    if not pulse_state or not isinstance(pulse_state, dict):
        return False
    started = pulse_state.get("started_at")
    if not started:
        return False
    try:
        started_dt = datetime.fromisoformat(started)
        age = datetime.now(timezone.utc) - started_dt
        if age > timedelta(hours=SESSION_EXPIRY_HOURS):
            return False
    except (ValueError, TypeError):
        return False
    q_idx = pulse_state.get("q_idx")
    questions = pulse_state.get("questions") or []
    return isinstance(q_idx, int) and 1 <= q_idx <= len(questions)


def build_initial_state(questions: list[str]) -> dict:
    """Build the morning_pulse_state dict sent with Q1."""
    return {
        "session_id": str(uuid.uuid4()),
        "questions": questions,
        "answers": [],
        "q_idx": 1,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Core actions ───────────────────────────────────────────────────────────────

def get_athlete_questions(athlete_row: dict) -> list[str]:
    """Return this athlete's configured morning pulse questions (or defaults)."""
    qs = athlete_row.get("morning_pulse_questions")
    if isinstance(qs, list) and all(isinstance(q, str) for q in qs) and len(qs) >= 1:
        return qs
    return DEFAULT_QUESTIONS


def start_session(supabase: Any, athlete_id: str, current_state: dict, questions: list[str]) -> str:
    """
    Set morning_pulse_state on the athlete's current_state and return the text of Q1.
    Called by the scheduler before sending the WhatsApp message.
    """
    state = build_initial_state(questions)
    new_current_state = {**current_state, "morning_pulse_state": state}
    try:
        supabase.table("athletes").update(
            {"current_state": new_current_state}
        ).eq("id", athlete_id).execute()
        logger.info("[morning_pulse] Started session %s for athlete=%s", state["session_id"][:8], athlete_id[:8])
    except Exception as exc:
        logger.warning("[morning_pulse] Failed to write pulse state for athlete=%s: %s", athlete_id[:8], exc)
    return questions[0]


def handle_answer(
    supabase: Any,
    athlete_id: str,
    coach_id: str,
    display_name: str,
    current_state: dict,
    answer_text: str,
) -> tuple[str | None, bool, str | None]:
    """
    Process an athlete's answer to the current pulse question.

    Returns:
        (reply_text, is_complete, coach_summary)
        - reply_text: the next question to send, OR the wrap-up "Thanks" message
        - is_complete: True when all 3 answers are collected and session is stored
        - coach_summary: AI-generated summary for the coach (only when is_complete=True)
    """
    pulse_state = current_state.get("morning_pulse_state", {})
    questions: list[str] = pulse_state.get("questions") or DEFAULT_QUESTIONS
    answers: list[str] = list(pulse_state.get("answers") or [])
    q_idx: int = int(pulse_state.get("q_idx") or 1)
    session_id: str = pulse_state.get("session_id") or str(uuid.uuid4())

    # Save this answer
    answers.append(answer_text.strip())

    total_questions = len(questions)
    next_q_idx = q_idx + 1

    if next_q_idx <= total_questions:
        # More questions remain — update state and return next question
        new_state = {
            **pulse_state,
            "answers": answers,
            "q_idx": next_q_idx,
        }
        new_current_state = {**current_state, "morning_pulse_state": new_state}
        try:
            supabase.table("athletes").update(
                {"current_state": new_current_state}
            ).eq("id", athlete_id).execute()
        except Exception as exc:
            logger.warning("[morning_pulse] Failed to advance pulse state for %s: %s", athlete_id[:8], exc)

        next_q_text = questions[next_q_idx - 1]
        logger.info(
            "[morning_pulse] Athlete=%s answered Q%d, sending Q%d",
            athlete_id[:8], q_idx, next_q_idx,
        )
        return next_q_text, False, None

    else:
        # All questions answered — generate summary, persist session, clear state
        summary = _generate_summary(display_name, questions, answers)
        _persist_session(supabase, session_id, athlete_id, coach_id, questions, answers, summary)
        _update_coach_notes(supabase, athlete_id, current_state, summary)
        _clear_pulse_state(supabase, athlete_id, current_state)

        thanks = (
            f"Thanks {display_name or 'there'} 🙌 Logged. "
            "Your coach can see this — keep it up."
        )
        logger.info("[morning_pulse] Session complete for athlete=%s", athlete_id[:8])
        return thanks, True, summary


# ── Helpers ────────────────────────────────────────────────────────────────────

def _generate_summary(display_name: str, questions: list[str], answers: list[str]) -> str:
    """
    Generate a 1-line summary from Q&A pairs.
    Tries the LLM first; falls back to a simple concat if it fails.
    """
    try:
        from app.services.llm_client import LLMClient
        qa_block = "\n".join(
            f"Q: {q}\nA: {a}" for q, a in zip(questions, answers)
        )
        client = LLMClient()
        resp = client.chat_completions(
            system=(
                "You are a sports coaching AI. Summarize the athlete's morning check-in "
                "in one concise sentence (max 25 words) for the coach. Focus on any flags "
                "(soreness, poor sleep, injuries). No greetings, no sign-off."
            ),
            user=f"Athlete: {display_name}\n\n{qa_block}",
        )
        return resp.content.strip()
    except Exception as exc:
        logger.warning("[morning_pulse] LLM summary failed, using fallback: %s", exc)
        # Fallback: concatenate answers
        pairs = [f"{a}" for a in answers]
        return f"Pulse: {' | '.join(pairs)}"


def _persist_session(
    supabase: Any,
    session_id: str,
    athlete_id: str,
    coach_id: str,
    questions: list[str],
    answers: list[str],
    summary: str,
) -> None:
    """Upsert a completed morning_pulse_sessions row."""
    try:
        today = datetime.now(timezone.utc).date().isoformat()
        supabase.table("morning_pulse_sessions").upsert({
            "id": session_id,
            "athlete_id": athlete_id,
            "coach_id": coach_id,
            "session_date": today,
            "questions": questions,
            "answers": answers,
            "summary_text": summary,
            "completed": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="athlete_id,session_date").execute()
        logger.info("[morning_pulse] Persisted session=%s for athlete=%s", session_id[:8], athlete_id[:8])
    except Exception as exc:
        logger.warning("[morning_pulse] Failed to persist session for athlete=%s: %s", athlete_id[:8], exc)


def _update_coach_notes(supabase: Any, athlete_id: str, current_state: dict, summary: str) -> None:
    """Append today's pulse summary to current_state.coach_notes (non-destructive)."""
    try:
        today = datetime.now(timezone.utc).strftime("%b %d")
        existing_notes = (current_state.get("coach_notes") or "").strip()
        pulse_line = f"[Pulse {today}] {summary}"
        new_notes = f"{pulse_line}\n{existing_notes}".strip()[:1000]  # cap to avoid bloat
        # Don't write full current_state here — just update coach_notes via a targeted update
        supabase.table("athletes").update({
            "current_state": {**current_state, "coach_notes": new_notes, "morning_pulse_state": None}
        }).eq("id", athlete_id).execute()
    except Exception as exc:
        logger.warning("[morning_pulse] Failed to update coach_notes for athlete=%s: %s", athlete_id[:8], exc)


def _clear_pulse_state(supabase: Any, athlete_id: str, current_state: dict) -> None:
    """Remove morning_pulse_state from current_state (already done in _update_coach_notes)."""
    # _update_coach_notes already sets morning_pulse_state=None, so this is a no-op
    pass
