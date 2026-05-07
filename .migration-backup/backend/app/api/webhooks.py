"""Webhook routes for athlete check-in flow."""
from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.agents.check_in import (
    AthleteCheckIn,
    assess_check_in,
    persist_check_in_state,
)
from app.core.config import get_settings
from app.core.security import verify_whatsapp_signature
from app.services.scope import DataScope, apply_scope_payload, apply_scope_query

logger = logging.getLogger(__name__)


def _get_scope() -> DataScope:
    """Build a DataScope from the app settings singleton.
    Settings already loads ORGANIZATION_ID and COACH_ID from Railway env vars,
    so this always returns a configured scope in production."""
    s = get_settings()
    return DataScope(
        organization_id=str(s.organization_id) if s.organization_id else None,
        coach_id=str(s.coach_id) if s.coach_id else None,
    )


def _mask_phone(phone: str) -> str:
    """Mask a phone number for safe logging: +1***...3086"""
    s = str(phone)
    if len(s) <= 4:
        return "****"
    return s[:2] + "***" + s[-4:]


router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


@dataclass(slots=True)
class AthleteRecord:
    athlete_id: str
    coach_id: str
    phone_number: str
    timezone_name: str
    display_name: str | None = None
    coach_whatsapp_number: str | None = None
    stable_profile: dict | None = None   # COA-25: race, zones, injury history
    current_state: dict | None = None    # COA-25: phase, readiness, HRV, soreness


class WhatsAppWebhookResponse(BaseModel):
    status: str
    athlete_id: str | None = None
    coach_id: str | None = None
    message_id: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_payload(raw_body: bytes, content_type: str) -> dict[str, Any]:
    """Parse raw request body into a dict — does NOT read from request again."""
    if not raw_body:
        return {}
    if "application/json" in content_type or raw_body.lstrip().startswith((b"{", b"[")):
        try:
            decoded = json.loads(raw_body.decode("utf-8"))
            return decoded if isinstance(decoded, dict) else {"data": decoded}
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")
    parsed = parse_qs(raw_body.decode("utf-8"), keep_blank_values=True)
    return {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}


def _phone_variants(phone_number: str) -> list[str]:
    raw = phone_number.strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    variants = {raw, digits, f"+{digits}"}
    if len(digits) == 11 and digits.startswith("1"):
        variants.add(digits[1:])
        variants.add(f"+1{digits[1:]}")
    if len(digits) == 10:
        variants.add(f"1{digits}")
        variants.add(f"+1{digits}")
    return list(variants)


async def _query_rows(query: Any) -> list[dict[str, Any]]:
    if hasattr(query, "execute"):
        result = query.execute()
        response = await result if inspect.isawaitable(result) else result
    else:
        response = await query if inspect.isawaitable(query) else query
    if response is None:
        return []
    data = getattr(response, "data", response)
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        return [data]
    return []


async def _find_athlete_by_phone(supabase_client: Any, phone_number: str) -> AthleteRecord | None:
    variants = _phone_variants(phone_number)
    logger.info("[webhook] Looking up athlete by phone variants: %s", [_mask_phone(v) for v in variants])
    for value in variants:
        rows = await _query_rows(
            # COA-89: exclude archived athletes (archived_at IS NULL means active)
            supabase_client.table("athletes").select("*").eq("phone_number", value).is_("archived_at", "null")
        )
        if rows:
            row = rows[0]
            logger.info("[webhook] Found athlete: id=%s coach_id=%s", row.get("id"), row.get("coach_id"))
            coach_wa = row.get("coach_whatsapp_number")
            if not coach_wa:
                coach_rows = await _query_rows(
                    supabase_client.table("coaches").select("whatsapp_number").eq("id", row.get("coach_id"))
                )
                if coach_rows:
                    coach_wa = coach_rows[0].get("whatsapp_number")
            if not coach_wa:
                settings = get_settings()
                coach_wa = getattr(settings, "coach_whatsapp_number", None)
            return AthleteRecord(
                athlete_id=str(row.get("id") or ""),
                coach_id=str(row.get("coach_id") or ""),
                phone_number=str(row.get("phone_number") or ""),
                timezone_name=str(row.get("timezone_name") or "UTC"),
                display_name=row.get("full_name") or row.get("display_name"),
                coach_whatsapp_number=coach_wa,
                stable_profile=row.get("stable_profile") or {},
                current_state=row.get("current_state") or {},
            )
    logger.warning("[webhook] No athlete found for phone variants: %s", [_mask_phone(v) for v in variants])
    return None


async def _find_coach_by_phone(supabase_client: Any, phone_number: str) -> dict | None:
    """Return the coach row if sender is a registered coach, else None."""
    variants = _phone_variants(phone_number)
    logger.info("[webhook] Looking up coach by phone variants: %s", [_mask_phone(v) for v in variants])
    for value in variants:
        rows = await _query_rows(
            supabase_client.table("coaches").select("*").eq("whatsapp_number", value)
        )
        if rows:
            logger.info("[webhook] Found coach: id=%s", rows[0].get("id"))
            return rows[0]
    return None


async def _send_whatsapp_message(request: Request, to: str, body: str) -> None:
    whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
    if whatsapp_client is None:
        logger.warning("[webhook] whatsapp_client not available — cannot send to %s", _mask_phone(to))
        return
    try:
        await whatsapp_client.send_message(to, body)
        logger.info("[webhook] Sent WhatsApp message to %s", _mask_phone(to))
    except Exception as exc:
        logger.error("[webhook] Failed to send WhatsApp message to %s: %s", _mask_phone(to), exc)


async def _build_training_plan_context(athlete: "AthleteRecord", supabase: Any) -> str:
    """Return a formatted block of this week's workouts with completion status (COA-47)."""
    from datetime import date as _date
    today = _date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    try:
        workout_rows = await _query_rows(
            apply_scope_query(
                supabase.table("workouts")
                .select(
                    "scheduled_date, session_type, duration_min, distance_km, "
                    "hr_zone, target_pace, coaching_notes, status"
                )
                .eq("athlete_id", athlete.athlete_id)
                .gte("scheduled_date", week_start.isoformat())
                .lte("scheduled_date", week_end.isoformat())
                .order("scheduled_date", desc=False),
                _get_scope(),
            )
        )
    except Exception as exc:
        logger.warning("[webhook] Training plan context failed: %s", exc)
        return ""

    if not workout_rows:
        return ""

    lines = ["=== THIS WEEK'S TRAINING PLAN ==="]
    total_planned_min = 0
    total_completed_min = 0
    for row in workout_rows:
        try:
            sched = _date.fromisoformat(row["scheduled_date"])
        except (KeyError, ValueError):
            continue
        dow = day_names[sched.weekday()]
        if sched < today:
            tag = "COMPLETED" if row.get("status") == "completed" else "MISSED"
        elif sched == today:
            tag = "TODAY"
        else:
            tag = "UPCOMING"
        dur = row.get("duration_min") or 0
        total_planned_min += dur
        if tag == "COMPLETED":
            total_completed_min += dur
        line = f"  {dow} {sched.isoformat()} [{tag}] {row.get('session_type', '?')} — {dur}min"
        if row.get("distance_km"):
            line += f", {row['distance_km']}km"
        if row.get("hr_zone"):
            line += f", Zone {row['hr_zone']}"
        if row.get("coaching_notes"):
            line += f" | Note: {str(row['coaching_notes'])[:80]}"
        lines.append(line)
    lines.append(
        f"  Weekly load: {total_completed_min}min completed of {total_planned_min}min planned"
    )
    return "\n".join(lines)


async def _build_biometric_trend(athlete: "AthleteRecord", supabase: Any) -> str:
    """Return a 7-day HRV/readiness/sleep trend with divergence detection (COA-47)."""
    try:
        rows = await _query_rows(
            apply_scope_query(
                supabase.table("memory_states")
                .select("created_at, state, state_type")
                .eq("athlete_id", athlete.athlete_id)
                .in_("state_type", ["check_in", "biometric", "daily"])
                .order("created_at", desc=True)
                .limit(14),
                _get_scope(),
            )
        )
    except Exception as exc:
        logger.warning("[webhook] Biometric trend failed: %s", exc)
        return ""

    if not rows:
        return ""

    seen_dates: dict[str, dict] = {}
    for row in rows:
        dt = (row.get("created_at") or "")[:10]
        if not dt or dt in seen_dates:
            continue
        state = row.get("state") or {}
        seen_dates[dt] = state

    # Build series newest-first, cap at 7 days
    sorted_dates = sorted(seen_dates.keys(), reverse=True)[:7]
    if not sorted_dates:
        return ""

    lines = ["=== 7-DAY BIOMETRIC TREND (newest first) ==="]
    hrv_vals: list[float] = []
    readiness_vals: list[float] = []
    for dt in sorted_dates:
        s = seen_dates[dt]
        hrv = s.get("hrv_ms") or s.get("hrv")
        readiness = s.get("readiness") or s.get("readiness_score")
        sleep = s.get("sleep_hours")
        parts = [dt]
        if hrv is not None:
            try:
                hrv_vals.append(float(hrv))
                parts.append(f"HRV={float(hrv):.0f}ms")
            except (ValueError, TypeError):
                pass
        if readiness is not None:
            try:
                readiness_vals.append(float(readiness))
                parts.append(f"Readiness={float(readiness):.0f}")
            except (ValueError, TypeError):
                pass
        if sleep is not None:
            try:
                parts.append(f"Sleep={float(sleep):.1f}h")
            except (ValueError, TypeError):
                pass
        lines.append("  " + " | ".join(parts))

    # Divergence signal: athlete self-reports high readiness but HRV trending down
    if len(hrv_vals) >= 3 and len(readiness_vals) >= 1:
        recent_hrv_avg = sum(hrv_vals[:3]) / 3
        oldest_hrv = hrv_vals[-1]
        latest_readiness = readiness_vals[0]
        if oldest_hrv > 0 and (oldest_hrv - recent_hrv_avg) / oldest_hrv > 0.10 and latest_readiness >= 70:
            lines.append(
                "  ⚠ DIVERGENCE SIGNAL: HRV declining >10% over window while self-reported "
                "readiness is high — possible accumulating fatigue."
            )

    return "\n".join(lines)


async def _build_system_prompt(athlete: AthleteRecord, supabase: Any, query_text: str = "") -> str:
    """Build a rich system prompt using athlete profile, current state, and coach methodology (COA-25)."""
    _t0 = time.monotonic()
    coach_persona = ""
    coach_rules = ""
    try:
        coach_rows = await _query_rows(
            supabase.table("coaches").select(
                "methodology_playbook, persona_system_prompt"
            ).eq("id", athlete.coach_id)
        )
        if coach_rows:
            coach = coach_rows[0]
            coach_persona = coach.get("persona_system_prompt") or ""
            playbook = coach.get("methodology_playbook") or {}
            if playbook:
                rules = playbook.get("rules", [])
                periodization = playbook.get("periodization", "")
                intensity = playbook.get("intensity_system", "")
                parts = []
                if periodization:
                    parts.append(f"Periodization: {periodization}")
                if intensity:
                    parts.append(f"Intensity system: {intensity}")
                if rules:
                    parts.append("Coaching rules: " + "; ".join(rules))
                coach_rules = ". ".join(parts)
    except Exception as exc:
        logger.warning("[webhook] Could not fetch coach methodology: %s", exc)

    sp = athlete.stable_profile or {}
    cs = athlete.current_state or {}

    athlete_context_parts = []
    if sp.get("target_race"):
        race_str = sp["target_race"]
        if sp.get("race_date"):
            race_str += f" on {sp['race_date']}"
        athlete_context_parts.append(f"Target race: {race_str}")
    if sp.get("max_weekly_hours"):
        athlete_context_parts.append(f"Max weekly training volume: {sp['max_weekly_hours']} hours")
    if sp.get("training_zones", {}).get("run"):
        zones = sp["training_zones"]["run"]
        zone_str = ", ".join(f"{k.upper()}: {v}" for k, v in zones.items() if v)
        if zone_str:
            athlete_context_parts.append(f"Run HR zones (bpm): {zone_str}")
    if sp.get("swim_css"):
        athlete_context_parts.append(f"Swim CSS pace: {sp['swim_css']}/100m")
    if sp.get("injury_history"):
        athlete_context_parts.append(f"Injury history: {sp['injury_history']}")
    if sp.get("notes"):
        athlete_context_parts.append(f"Athlete notes: {sp['notes']}")

    state_parts = []
    if cs.get("training_phase"):
        phase_str = cs["training_phase"]
        if cs.get("training_week"):
            phase_str += f" (week {cs['training_week']})"
        state_parts.append(f"Training phase: {phase_str}")
    # Oura-synced values (oura_ prefix) take priority; fall back to manually entered coach values
    readiness = cs.get("oura_readiness_score") if cs.get("oura_readiness_score") is not None else cs.get("last_readiness_score")
    hrv = cs.get("oura_avg_hrv") if cs.get("oura_avg_hrv") is not None else cs.get("last_hrv")
    sleep_score = cs.get("oura_sleep_score") if cs.get("oura_sleep_score") is not None else cs.get("last_sleep_score")
    oura_date = cs.get("oura_sync_date")  # e.g. "2026-04-13"
    oura_suffix = f" (Oura, {oura_date})" if oura_date else ""
    if readiness is not None:
        state_parts.append(f"Today's readiness score: {readiness}/100{oura_suffix}")
    if hrv is not None:
        state_parts.append(f"Last HRV: {hrv}ms{oura_suffix}")
    if sleep_score is not None:
        state_parts.append(f"Last sleep score: {sleep_score}/100{oura_suffix}")
    if cs.get("soreness"):
        state_parts.append(f"Current soreness: {cs['soreness']}")
    if cs.get("missed_workouts_this_week"):
        state_parts.append(f"Missed workouts this week: {cs['missed_workouts_this_week']}")
    if cs.get("coach_notes"):
        state_parts.append(f"Coach notes: {cs['coach_notes']}")

    # COA-30: Strava activity data
    strava_parts = []
    if cs.get("strava_last_activity_type"):
        activity_line = (
            f"Last activity: {cs['strava_last_activity_type']} "
            f"on {cs.get('strava_last_activity_date', '?')} — "
            f"{cs.get('strava_last_distance_km', '?')}km "
            f"in {cs.get('strava_last_duration_min', '?')} min"
        )
        if cs.get("strava_last_avg_hr"):
            activity_line += f", avg HR {cs['strava_last_avg_hr']}bpm"
        strava_parts.append(activity_line)
    if cs.get("strava_weekly_activities") is not None:
        strava_parts.append(
            f"This week: {cs['strava_weekly_activities']} activities, "
            f"{cs.get('strava_weekly_distance_km', 0)}km total"
        )
    if strava_parts:
        state_parts.append("Strava — " + " | ".join(strava_parts))

    # COA-38: Predictive risk flags
    predictive_flags = cs.get("predictive_flags") or []
    if predictive_flags:
        high_flags = [f["label"] for f in predictive_flags if f.get("priority") == "high"]
        all_flags = [f["label"] for f in predictive_flags]
        if high_flags:
            state_parts.append(f"HIGH RISK FLAGS: {', '.join(high_flags)}")
        elif all_flags:
            state_parts.append(f"Predictive flags: {', '.join(all_flags)}")

    base = coach_persona or (
        "You are an expert endurance sports coach assistant. "
        "Draft a concise, supportive, professional reply FROM the coach TO the athlete. "
        "Keep it under 3 sentences. Be specific and data-driven when biometric data is available."
    )
    prompt_parts = [base]
    if coach_rules:
        prompt_parts.append(f"\n\nCoaching methodology:\n{coach_rules}")
    if athlete_context_parts:
        prompt_parts.append(
            f"\n\nAthlete profile for {athlete.display_name or 'this athlete'}:\n"
            + "\n".join(f"- {p}" for p in athlete_context_parts)
        )
    if state_parts:
        prompt_parts.append("\n\nCurrent athlete state:\n" + "\n".join(f"- {p}" for p in state_parts))

    # COA-36: Paired conversation thread
    conversation_parts: list[str] = []
    try:
        suggestion_rows = await _query_rows(
            apply_scope_query(
                supabase.table("suggestions")
                .select("id, suggestion_text, coach_reply, status, created_at")
                .eq("athlete_id", athlete.athlete_id)
                .order("created_at", desc=True)
                .limit(10),
                _get_scope(),
            )
        )
        total_len = 0
        for row in suggestion_rows:
            dt = (row.get("created_at") or "")[:10]
            checkin_rows = await _query_rows(
                apply_scope_query(
                    supabase.table("athlete_checkins")
                    .select("message_text")
                    .eq("suggestion_id", row["id"])
                    .limit(1),
                    _get_scope(),
                )
            )
            athlete_msg = (checkin_rows[0].get("message_text") or "")[:150] if checkin_rows else ""
            coach_sent = row.get("coach_reply") or ""
            if not coach_sent and row.get("status") == "approved":
                coach_sent = f"[Approved AI: {(row.get('suggestion_text') or '')[:100]}]"
            elif not coach_sent:
                coach_sent = "[Pending]"
            entry_parts = [f"[{dt}]"]
            if athlete_msg:
                entry_parts.append(f'Athlete: "{athlete_msg}"')
            entry_parts.append(f'Coach: "{coach_sent}"')
            entry = " | ".join(entry_parts)
            if total_len + len(entry) > 1500:
                break
            conversation_parts.append(entry)
            total_len += len(entry)
    except Exception as exc:
        logger.warning("[webhook] Could not fetch conversation thread: %s", exc)

    # COA-27: Memory state (latest note for this athlete)
    memory_note = ""
    try:
        memory_rows = await _query_rows(
            apply_scope_query(
                supabase.table("memory_states")
                .select("*")
                .eq("athlete_id", athlete.athlete_id)
                .order("created_at", desc=True)
                .limit(1),
                _get_scope(),
            )
        )
        if memory_rows:
            row = memory_rows[0]
            memory_note = (
                row.get("summary")
                or row.get("notes")
                or row.get("rationale")
                or ""
            )
    except Exception as exc:
        logger.warning("[webhook] Could not fetch memory state: %s", exc)

    if conversation_parts:
        prompt_parts.append("\n\nRecent conversation history (athlete → coach):\n" + "\n".join(conversation_parts))
    if memory_note:
        prompt_parts.append(f"\n\nCoach memory note:\n{memory_note}")

    # COA-47: Training plan context (this week's workouts + completion)
    try:
        training_plan_block = await _build_training_plan_context(athlete, supabase)
        if training_plan_block:
            prompt_parts.append(f"\n\n{training_plan_block}")
    except Exception as exc:
        logger.warning("[webhook] Training plan context failed: %s", exc)

    # COA-47: Biometric trend (7-day HRV/readiness/sleep + divergence detection)
    try:
        biometric_trend_block = await _build_biometric_trend(athlete, supabase)
        if biometric_trend_block:
            prompt_parts.append(f"\n\n{biometric_trend_block}")
    except Exception as exc:
        logger.warning("[webhook] Biometric trend context failed: %s", exc)

    # COA-83: Inject rolling athlete memory summary (Tier 1)
    # B-15: MemoryService.get_summary is synchronous — wrap in threadpool.
    try:
        from app.services.memory_service import MemoryService
        from starlette.concurrency import run_in_threadpool as _mem_pool
        memory_summary = await _mem_pool(MemoryService(supabase).get_summary, athlete.athlete_id)
        if memory_summary:
            prompt_parts.append(f"\n\n## Athlete Memory\n{memory_summary}")
    except Exception as exc:
        logger.warning("[webhook] Memory summary injection failed: %s", exc)

    # COA-87: Two-tier RAG — Tier 1 (coach athlete notes) + Tier 2 (knowledge base search)
    try:
        from app.services.document_retrieval import DocumentRetrievalService
        from starlette.concurrency import run_in_threadpool as _pool
        retrieval = DocumentRetrievalService(supabase)

        # Tier 1: coach's notes on this specific athlete — always injected
        notes_block = await _pool(
            retrieval.get_coach_athlete_notes,
            athlete.coach_id,
            athlete.athlete_id,
        )
        if notes_block:
            prompt_parts.append(f"\n\n{notes_block}")

        # Tier 2: semantic search over coach's approved knowledge base
        # COA-91: 3s timeout — RAG embed must not blow Meta's 20s webhook deadline
        if query_text:
            try:
                kb_block = await asyncio.wait_for(
                    _pool(retrieval.retrieve_knowledge, athlete.coach_id, query_text),
                    timeout=3.0,
                )
            except asyncio.TimeoutError:
                kb_block = ""
                logger.warning(
                    "[COA-91] RAG knowledge retrieval timed out (3s) — skipping for athlete=%s",
                    athlete.athlete_id[:8],
                )
            if kb_block:
                prompt_parts.append(f"\n\n{kb_block}")
    except Exception as exc:
        logger.warning("[webhook] RAG injection failed (non-fatal): %s", exc)

    prompt = "".join(prompt_parts)
    _build_ms = int((time.monotonic() - _t0) * 1000)
    logger.info(
        "[COA-91] Built system prompt: %d chars, %d profile fields, %d state fields, latency=%dms",
        len(prompt), len(athlete_context_parts), len(state_parts), _build_ms,
    )
    return prompt


# ---------------------------------------------------------------------------
# COA-47: Structured AI decision engine (Poke architecture)
# Reasoning stays internal. What's surfaced to coach/athlete is clean output only.
# ---------------------------------------------------------------------------

_AI_DECISION_SYSTEM = """\
You are an expert endurance sports coach AI. Your job is to analyze an athlete check-in \
and produce a structured coaching decision.

You MUST respond with a valid JSON object — no prose, no markdown, just the JSON.

Required fields:
{
  "reply": "<string — the draft WhatsApp message FROM the coach TO the athlete. \
Warm, concise, specific. 1-3 sentences max. No coaching jargon. No reasoning shown.>",
  "workout_adjustment": null | {
    "session_type": "<e.g. Easy Run, Rest, Swim Threshold>",
    "duration_min": <integer>,
    "distance_km": <number | null>,
    "hr_zone": <integer | null>,
    "coaching_notes": "<very short internal note for coach dashboard, NOT sent to athlete>"
  },
  "adjustment_reason": "<internal rationale — never shown to athlete or coach in WhatsApp. \
Stored in DB only. Be specific: cite the data signal that drove the decision.>",
  "urgency": "<one of: routine | flag | urgent>",
  "auto_send": <true | false>
}

URGENCY + AUTO-SEND RULES:
- "routine": standard positive check-in, no concerns → auto_send: true
- "flag": readiness/HRV concern or missed workouts → auto_send: false (coach reviews)
- "urgent": injury mention, distress, or extreme biometric signal → auto_send: false

SAFETY OVERRIDES (always apply regardless of data):
- If urgency == "urgent" → auto_send MUST be false
- If workout_adjustment is not null → auto_send MUST be false (coach must approve changes)
- When in doubt → auto_send: false

Keep the "reply" field as a clean, ready-to-send WhatsApp message. \
The coach will see the draft, approve or edit it, then send. \
Do not leak reasoning into the reply."""

_AI_DECISION_FALLBACK = {
    "reply": "Thanks for checking in — your coach will review this and get back to you shortly.",
    "workout_adjustment": None,
    "adjustment_reason": "AI decision failed — fallback used.",
    "urgency": "flag",
    "auto_send": False,
}


async def _generate_ai_decision(
    athlete: AthleteRecord, text: str, supabase: Any = None, workout_context: bool = False
) -> dict:
    """COA-47: Generate a structured AI coaching decision.

    Returns a dict with keys: reply, workout_adjustment, adjustment_reason, urgency, auto_send.
    Reasoning (adjustment_reason) is NEVER included in WhatsApp messages — stored in DB only.
    workout_context=True (COA-56) injects a mid-workout prompt modifier and bumps urgency floor to 'flag'.
    Uses LLMClient so provider switches (Groq → OpenAI etc.) via env vars work automatically.
    """
    from app.services.llm_client import LLMClient
    from starlette.concurrency import run_in_threadpool

    if supabase:
        system_prompt = await _build_system_prompt(athlete, supabase, query_text=text)
    else:
        system_prompt = (
            f"You are an expert endurance sports coach AI. "
            f"Draft a concise, supportive reply FROM the coach TO {athlete.display_name or 'the athlete'}."
        )

    # COA-56: Inject workout context modifier when athlete is narrating mid-effort
    if workout_context:
        workout_prefix = (
            "⚡ WORKOUT CONTEXT: The athlete sent this as a voice note during or immediately after "
            "an active workout. They may be mid-effort. Be extremely direct and concise — 1 sentence max. "
            "Focus on immediate actionable feedback (pace, effort, form, hydration). "
            "Do NOT suggest stopping unless there is a safety concern. "
            "Do NOT ask follow-up questions. Respond as if you are coaching them in real time.\n\n"
        )
        system_prompt = workout_prefix + system_prompt

    full_system = f"{system_prompt}\n\n{_AI_DECISION_SYSTEM}"
    user_prompt = f'Athlete check-in message: "{text}"\n\nProduce your structured coaching decision as JSON:'

    try:
        llm = LLMClient()
        response = await run_in_threadpool(
            llm.chat_completions,
            system=full_system,
            user=user_prompt,
        )
        raw = response.content.strip()
        # Strip markdown code fences if model wraps output in ```json ... ```
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        decision = json.loads(raw)

        # Safety overrides — enforce regardless of what the model returned
        if decision.get("urgency") == "urgent":
            decision["auto_send"] = False
        if decision.get("workout_adjustment") is not None:
            decision["auto_send"] = False

        # COA-56: Workout context floor — never auto-send mid-workout voice notes,
        # and bump routine → flag so coach always sees real-time narration.
        if workout_context:
            if decision.get("urgency") == "routine":
                decision["urgency"] = "flag"
            decision["auto_send"] = False

        logger.info(
            "[webhook] AI decision: urgency=%s auto_send=%s adjustment=%s workout_context=%s model=%s",
            decision.get("urgency"),
            decision.get("auto_send"),
            "yes" if decision.get("workout_adjustment") else "no",
            workout_context,
            response.model,
        )
        return decision

    except json.JSONDecodeError as exc:
        logger.error("[webhook] AI decision JSON parse failed: %s", exc)
        return dict(_AI_DECISION_FALLBACK)
    except Exception as exc:
        logger.error("[webhook] AI decision failed: %s", exc)
        return dict(_AI_DECISION_FALLBACK)


async def _generate_suggestion(athlete: AthleteRecord, text: str, supabase: Any = None, workout_context: bool = False) -> str:
    """Backward-compatible shim — callers not yet updated to structured decisions."""
    decision = await _generate_ai_decision(athlete, text, supabase, workout_context=workout_context)
    return decision.get("reply", _AI_DECISION_FALLBACK["reply"])


# ---------------------------------------------------------------------------
# COA-107: Media message handling (image/video form analysis)
# ---------------------------------------------------------------------------

def _extract_media_info(payload: dict) -> tuple[str | None, str | None, str | None]:
    """Extract (sender, media_type, media_id) from a WhatsApp webhook payload.

    Returns (None, None, None) if the message is not an image or video.
    """
    if "entry" not in payload:
        return None, None, None
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            val = change.get("value", {})
            if "messages" not in val:
                continue
            msg = val["messages"][0]
            msg_type = msg.get("type")
            sender = msg.get("from")
            if msg_type == "image":
                media_id = (msg.get("image") or {}).get("id")
                return sender, "image", media_id
            elif msg_type == "video":
                media_id = (msg.get("video") or {}).get("id")
                return sender, "video", media_id
    return None, None, None


async def _download_whatsapp_media(media_id: str) -> bytes:
    """Download media bytes from the WhatsApp Cloud API for a given media ID."""
    settings = get_settings()
    token = settings.whatsapp_access_token
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        meta_resp = await client.get(
            f"https://graph.facebook.com/v18.0/{media_id}",
            headers=headers,
        )
        meta_resp.raise_for_status()
        media_url = meta_resp.json()["url"]
        media_resp = await client.get(media_url, headers=headers)
        media_resp.raise_for_status()
        return media_resp.content


async def _handle_media_message(
    request: Any,
    supabase: Any,
    athlete: dict,
    sender: str,
    media_type: str,
    media_id: str,
) -> None:
    """COA-107: Background task — download media, run AI analysis, store in media_reviews.

    This function must be non-blocking relative to the webhook response.
    All errors are caught and logged — never raises to avoid crashing the event loop.
    """
    from starlette.concurrency import run_in_threadpool
    from app.services.media_analysis import analyze_media

    athlete_id = athlete.get("id") or athlete.get("athlete_id")
    coach_id = athlete.get("coach_id")

    logger.info("[COA-107] Starting media analysis: athlete=%s type=%s", str(athlete_id)[:8], media_type)

    try:
        # 1. Download media from Meta CDN
        try:
            media_bytes = await _download_whatsapp_media(media_id)
        except Exception as exc:
            logger.error("[COA-107] Media download failed for %s: %s", media_id[:8], exc)
            return

        # 2. Upload to Supabase Storage
        import time as _time
        filename = f"{int(_time.time())}_{media_type}.{'jpg' if media_type == 'image' else 'mp4'}"
        storage_path = f"athletes/{athlete_id}/{filename}"
        # B-03: All Supabase calls below are synchronous blocking I/O.
        # Wrapped in run_in_threadpool so they don't stall the async event loop.
        try:
            await run_in_threadpool(
                lambda: supabase.storage.from_("media-reviews").upload(
                    path=storage_path,
                    file=media_bytes,
                    file_options={"content-type": "image/jpeg" if media_type == "image" else "video/mp4"},
                )
            )
        except Exception as exc:
            logger.warning("[COA-107] Storage upload failed (non-fatal): %s", exc)
            storage_path = f"UPLOAD_FAILED/{athlete_id}/{filename}"

        # 3. Create pending_analysis record immediately
        insert_result = await run_in_threadpool(
            lambda: supabase.table("media_reviews").insert({
                "athlete_id": athlete_id,
                "coach_id": coach_id,
                "media_url": storage_path,
                "media_type": media_type,
                "whatsapp_media_id": media_id,
                "status": "pending_analysis",
            }).execute()
        )
        review_id = ((insert_result.data or [{}])[0]).get("id")

        if not review_id:
            logger.error("[COA-107] Failed to create media_reviews row")
            return

        # 4. Fetch coach persona + methodology
        coach_row = await run_in_threadpool(
            lambda: supabase.table("coaches").select(
                "persona_system_prompt, methodology_playbook, full_name"
            ).eq("id", coach_id).single().execute()
        )
        coach_data = coach_row.data or {}
        persona = (coach_data.get("persona_system_prompt") or "").strip()
        playbook = coach_data.get("methodology_playbook") or {}
        methodology_summary = (
            playbook.get("summary") or playbook.get("focus") or
            " | ".join(str(v) for v in list(playbook.values())[:3] if v)
        ) if playbook else None

        name = athlete.get("display_name") or athlete.get("full_name") or "Athlete"
        sp = athlete.get("stable_profile") or {}
        cs = athlete.get("current_state") or {}
        sport = sp.get("sport") or cs.get("sport") or "endurance sports"

        # 5. Run AI analysis (sync — called via threadpool)
        try:
            result = await run_in_threadpool(
                analyze_media,
                media_bytes=media_bytes,
                media_type=media_type,
                athlete_name=name,
                sport=sport,
                methodology_summary=methodology_summary,
                persona_prompt=persona or None,
            )
            ai_analysis = result.analysis
            logger.info("[COA-107] AI analysis complete: %d frames, %d chars", result.frames_extracted, len(ai_analysis))
        except Exception as exc:
            logger.error("[COA-107] AI analysis failed: %s", exc)
            ai_analysis = f"Media received ({media_type}). AI analysis unavailable — review directly."

        # 6. Update record with analysis
        await run_in_threadpool(
            lambda: supabase.table("media_reviews").update({
                "ai_analysis": ai_analysis,
                "status": "pending_coach_review",
            }).eq("id", review_id).execute()
        )

        logger.info("[COA-107] Media review %s ready for coach", str(review_id)[:8])

    except Exception as exc:
        logger.exception("[COA-107] Unhandled error in media message handler: %s", exc)


async def _download_whatsapp_audio(media_id: str) -> bytes:
    """Download audio bytes from the WhatsApp Cloud API for a given media ID."""
    settings = get_settings()
    token = settings.whatsapp_access_token
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Get the media URL from Meta Graph API
        meta_resp = await client.get(
            f"https://graph.facebook.com/v18.0/{media_id}",
            headers=headers,
        )
        meta_resp.raise_for_status()
        media_url = meta_resp.json()["url"]
        # Step 2: Download the actual audio bytes
        audio_resp = await client.get(media_url, headers=headers)
        audio_resp.raise_for_status()
        return audio_resp.content


async def _extract_message(payload: dict) -> tuple[str | None, str | None, str | None, bool]:
    """Extract (sender, text, wa_msg_id, is_voice) from a WhatsApp webhook payload.

    is_voice=True when the original message was an audio/voice note (even if transcribed to text).
    Used by COA-56 to apply workout-context detection and prompt tuning.
    """
    if "entry" not in payload:
        return None, None, None, False
    for entry in payload["entry"]:
        for change in entry.get("changes", []):
            val = change.get("value", {})
            if "messages" not in val:
                continue
            msg = val["messages"][0]
            sender = msg.get("from")
            wa_msg_id = msg.get("id")
            msg_type = msg.get("type")
            is_voice = False
            if msg_type == "text":
                text = msg.get("text", {}).get("body")
            elif msg_type in ("audio", "voice"):
                is_voice = True
                text = "[Audio Message]"
                media_id = msg.get("audio", {}).get("id") or msg.get("voice", {}).get("id")
                has_api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY")
                if media_id and has_api_key:
                    try:
                        audio_bytes = await _download_whatsapp_audio(media_id)
                        from app.services.audio_service import AudioMemoInput, AudioService
                        # B-02: AudioService.process_voice_memo is synchronous —
                        # must run in threadpool or it blocks the event loop for
                        # the full Whisper transcription duration (up to 120s).
                        from starlette.concurrency import run_in_threadpool as _rtp
                        result = await _rtp(
                            AudioService().process_voice_memo,
                            AudioMemoInput(
                                audio_bytes=audio_bytes,
                                filename="voice_memo.ogg",
                                mime_type="audio/ogg",
                            )
                        )
                        text = result.transcription.text.strip() or "[Audio Message]"
                        logger.info("[webhook] Transcribed voice note: %d chars", len(text))
                    except Exception:
                        logger.warning("[webhook] Voice note transcription failed — falling back", exc_info=True)
                        text = "[Audio Message]"
            else:
                text = None
            return sender, text, wa_msg_id, is_voice
    return None, None, None, False


# ---------------------------------------------------------------------------
# COA-56: Workout context detection for voice notes
# ---------------------------------------------------------------------------

import re as _re  # noqa: E402

# Patterns that indicate the athlete is narrating in real-time during a workout.
# Deliberately specific — present-tense, live data references only.
# Generic post-workout phrases ("just finished", "I ran today") are intentionally excluded.
_WORKOUT_CONTEXT_PATTERNS = [
    r"\bi'?m\s+currently\b",              # "I'm currently at zone 2", "I'm currently feeling"
    r"\bcurrently\s+(in|at|on)\s+my\b",   # "currently in my workout", "currently on my bike"
    r"\bmy\s+(current\s+)?(heart\s+rate|hr)\s+(is|at)\b",  # "my heart rate is", "my current HR is"
    r"\b(heart\s+rate|hr)\s+is\s+\d+\b",  # "heart rate is 165"
    r"\bi'?m\s+at\s+(km|mile|k)\b",       # "I'm at km 15", "I'm at mile 8"
    r"\b(pace|watts|power|cadence)\s+(is|are)\s+\d+",  # "pace is 5:30", "watts are 280"
    r"\bfeeling\b.{0,30}\bright\s+now\b", # "feeling strong right now"
    r"\bright\s+now\b.{0,30}\bfeeling\b", # "right now feeling"
    r"\bi'?m\s+(in|on)\s+(my|the)\s+(run|ride|bike|swim|workout|interval|set)\b",  # "I'm on my ride"
    r"\bzone\s+[1-7]\b.{0,40}\bright\s+now\b",  # "zone 2 right now"
    r"\bright\s+now\b.{0,40}\bzone\s+[1-7]\b",
    r"\bstill\s+(going|running|riding|swimming|pushing)\b",  # "still going", "still pushing"
    r"\bkm\s+\d+\b",                      # "km 18" mid-ride GPS callout
    r"\bmile\s+\d+\b",                    # "mile 12"
]

_WORKOUT_CONTEXT_RE = [_re.compile(p, _re.IGNORECASE) for p in _WORKOUT_CONTEXT_PATTERNS]


def _detect_workout_context(text: str) -> bool:
    """Return True if the transcription reads like real-time in-workout narration.

    Uses present-tense, live data references — not post-workout language.
    Requires at least one pattern match to avoid false positives.
    """
    if not text or text == "[Audio Message]":
        return False
    for pattern in _WORKOUT_CONTEXT_RE:
        if pattern.search(text):
            logger.info("[COA-56] Workout context detected via pattern: %s", pattern.pattern)
            return True
    return False


# ---------------------------------------------------------------------------
# Onboarding flow (COA-33)
# ---------------------------------------------------------------------------

async def _find_onboarding_session(supabase: Any, phone_number: str) -> dict | None:
    """Look up an in-progress onboarding session by phone number."""
    variants = _phone_variants(phone_number)
    for value in variants:
        rows = await _query_rows(
            supabase.table("onboarding_sessions").select("*").eq("phone_number", value)
        )
        if rows:
            return rows[0]
    return None


async def _start_onboarding(request: Request, supabase: Any, sender: str) -> WhatsAppWebhookResponse:
    """Create a new onboarding session and ask for the athlete's name."""
    from starlette.concurrency import run_in_threadpool as _onboard_pool
    await _onboard_pool(lambda: supabase.table("onboarding_sessions").insert({
        "phone_number": sender,
        "step": "ask_name",
        "collected": {},
    }).execute())

    await _send_whatsapp_message(
        request, sender,
        "Welcome to Andes.IA! \U0001f3cb\ufe0f\n"
        "I don't have you in the system yet. Let's get you set up in just a few steps.\n\n"
        "What's your full name?"
    )
    logger.info("[onboarding] Started onboarding for %s", _mask_phone(sender))
    return WhatsAppWebhookResponse(status="onboarding_started")


async def _handle_onboarding_step(
    request: Request,
    supabase: Any,
    sender: str,
    text: str,
    session: dict,
) -> WhatsAppWebhookResponse:
    """State-machine handler for multi-step onboarding."""
    step = session.get("step", "ask_name")
    collected = session.get("collected") or {}

    if step == "ask_name":
        collected["name"] = text.strip()
        new_step = "ask_race"
        name = collected["name"]
        await _send_whatsapp_message(
            request, sender,
            f"Nice to meet you, {name}! \U0001f44b\n\n"
            "What's your target race or event?\n"
            "(e.g. Ironman 70.3, Boston Marathon \u2014 or type 'skip')"
        )

    elif step == "ask_race":
        collected["race"] = "" if text.strip().lower() == "skip" else text.strip()
        new_step = "ask_race_date"
        await _send_whatsapp_message(
            request, sender,
            "Got it! When is the race?\n"
            "(e.g. November 2 2025 \u2014 or type 'skip')"
        )

    elif step == "ask_race_date":
        collected["race_date"] = "" if text.strip().lower() == "skip" else text.strip()
        new_step = "ask_timezone"
        await _send_whatsapp_message(
            request, sender,
            "Almost done! What timezone are you in?\n"
            "(e.g. America/New_York, America/Sao_Paulo, Europe/London \u2014 or type 'skip')"
        )

    elif step == "ask_timezone":
        collected["timezone"] = "UTC" if text.strip().lower() == "skip" else text.strip()
        supabase.table("onboarding_sessions").update({
            "step": "ask_oura",
            "collected": collected,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("phone_number", sender).execute()
        await _send_whatsapp_message(
            request, sender,
            "One last thing — do you have an Oura Ring? 💍\n\n"
            "If yes, paste your Personal Access Token from:\n"
            "cloud.ouraring.com/personal-access-tokens\n\n"
            "Or type 'skip' to set it up later."
        )
        logger.info("[onboarding] %s advanced to step=ask_oura", _mask_phone(sender))
        return WhatsAppWebhookResponse(status="onboarding_ask_oura")

    elif step == "ask_oura":
        if text.strip().lower() != "skip":
            collected["oura_token"] = text.strip()
        return await _complete_onboarding(request, supabase, sender, collected)

    else:
        logger.warning("[onboarding] Unknown step %s for %s — restarting", step, _mask_phone(sender))
        return await _start_onboarding(request, supabase, sender)

    # Persist step transition
    supabase.table("onboarding_sessions").update({
        "step": new_step,
        "collected": collected,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("phone_number", sender).execute()

    logger.info("[onboarding] %s advanced to step=%s", _mask_phone(sender), new_step)
    return WhatsAppWebhookResponse(status="onboarding_step")


async def _complete_onboarding(
    request: Request,
    supabase: Any,
    sender: str,
    collected: dict,
) -> WhatsAppWebhookResponse:
    """Finalize onboarding: create athlete, notify coach, clean up session."""
    # Resolve coach
    coach_id = None
    coach_whatsapp = None
    try:
        coach_rows = await _query_rows(
            supabase.table("coaches").select("id, whatsapp_number").limit(1)
        )
        if coach_rows:
            coach_id = coach_rows[0].get("id")
            coach_whatsapp = coach_rows[0].get("whatsapp_number")
    except Exception as exc:
        logger.warning("[onboarding] Could not fetch coach row: %s", exc)

    if not coach_id:
        coach_id = get_settings().coach_id
    if not coach_whatsapp:
        coach_whatsapp = getattr(get_settings(), "coach_whatsapp_number", None)

    # Build stable_profile
    stable_profile: dict[str, Any] = {}
    if collected.get("race"):
        stable_profile["target_race"] = collected["race"]
    if collected.get("race_date"):
        stable_profile["race_date"] = collected["race_date"]

    # Create athlete
    name = collected.get("name", "New Athlete")
    athlete_payload = {
        "full_name": name,
        "phone_number": sender,
        "coach_id": coach_id,
        "timezone_name": collected.get("timezone") or "UTC",
        "stable_profile": stable_profile,
        "current_state": {},
    }
    result = supabase.table("athletes").insert(apply_scope_payload(athlete_payload, _get_scope())).execute()

    athlete_id = result.data[0]["id"] if result.data else None

    # Store Oura token if provided
    if collected.get("oura_token") and athlete_id:
        supabase.table("oura_tokens").upsert({
            "athlete_id": athlete_id,
            "access_token": collected["oura_token"],
        }, on_conflict="athlete_id").execute()
        logger.info("[onboarding] Stored Oura token for athlete %s", athlete_id)

    # Generate Strava connect link
    strava_link = None
    if athlete_id:
        try:
            connect_token = secrets.token_urlsafe(24)
            expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
            supabase.table("athlete_connect_tokens").insert({
                "athlete_id": athlete_id,
                "token": connect_token,
                "purpose": "strava_connect",
                "expires_at": expires_at,
            }).execute()
            base_url = get_settings().frontend_url  # B-04: use env var, not hardcoded URL
            strava_link = f"{base_url}/connect/strava?token={connect_token}"
            logger.info("[onboarding] Generated Strava connect token for %s", _mask_phone(sender))
        except Exception as exc:
            logger.warning("[onboarding] Failed to generate Strava connect link: %s", exc)

    # Delete onboarding session
    supabase.table("onboarding_sessions").delete().eq("phone_number", sender).execute()

    # Confirm to athlete
    oura_prefix = (
        "✅ Oura Ring connected! We'll pull your readiness, HRV, and sleep scores automatically.\n\n"
        if collected.get("oura_token") else ""
    )
    await _send_whatsapp_message(
        request, sender,
        f"{oura_prefix}✅ You're all set, {name}!\n\n"
        "Your coach has been notified and will be in touch soon.\n"
        "Feel free to start sending your daily check-ins here anytime."
    )

    # Send Strava connect link as a separate message
    if strava_link:
        await _send_whatsapp_message(
            request, sender,
            f"\U0001f6b4 Want to connect Strava?\n\n"
            f"Tap this link on your phone (valid 24 hours):\n{strava_link}\n\n"
            "Just tap Authorize and you're done!"
        )
        logger.info("[onboarding] Sent Strava connect link to %s", _mask_phone(sender))

    # Generate plan_access token and send plan link
    if athlete_id:
        try:
            plan_token = secrets.token_urlsafe(32)
            plan_expires = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
            supabase.table("athlete_connect_tokens").insert({
                "athlete_id": athlete_id,
                "token": plan_token,
                "purpose": "plan_access",
                "expires_at": plan_expires,
            }).execute()
            base_url = get_settings().frontend_url  # B-04: use env var, not hardcoded URL
            await _send_whatsapp_message(
                request, sender,
                f"📋 Your training plan is ready! View it anytime here:\n"
                f"{base_url}/my-plan?token={plan_token}\n\n"
                "Bookmark this link — it's your personal plan page."
            )
            logger.info("[onboarding] Sent plan link to %s", _mask_phone(sender))
        except Exception as exc:
            logger.warning("[onboarding] Failed to generate plan link: %s", exc)

    # Notify coach
    if coach_whatsapp:
        masked = _mask_phone(sender)
        await _send_whatsapp_message(
            request, coach_whatsapp,
            f"\U0001f195 New athlete onboarded via WhatsApp: {name} ({masked})\n"
            "Check the dashboard to review their profile."
        )

    logger.info("[onboarding] Completed onboarding for %s name=%s", _mask_phone(sender), name)
    return WhatsAppWebhookResponse(status="onboarding_complete")


# ---------------------------------------------------------------------------
# Handshake
# ---------------------------------------------------------------------------

@router.get("/whatsapp", response_class=PlainTextResponse)
async def whatsapp_webhook_handshake(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
) -> str:
    # B-17: Per Meta spec, must verify hub.mode == "subscribe" before returning challenge.
    if hub_mode == "subscribe" and hub_verify_token == get_settings().whatsapp_verify_token:
        return hub_challenge or ""
    raise HTTPException(status_code=403)


# ---------------------------------------------------------------------------
# Main webhook — handles BOTH athletes and coaches in one endpoint
# ---------------------------------------------------------------------------

@router.post("/whatsapp", response_model=WhatsAppWebhookResponse)
async def whatsapp_webhook(request: Request) -> WhatsAppWebhookResponse:
    # FIX 1: Read body ONCE here, pass it everywhere — never call request.body() again
    raw_body = await request.body()
    logger.info("[webhook] Received POST /whatsapp, body size=%d bytes", len(raw_body))

    try:
        verify_whatsapp_signature(request, raw_body)
    except HTTPException as exc:
        logger.error("[webhook] Signature verification failed: %s", exc.detail)
        raise

    content_type = (request.headers.get("content-type") or "").lower()
    payload = _parse_payload(raw_body, content_type)

    sender, text, wa_msg_id, is_voice = await _extract_message(payload)

    # COA-107: Handle image/video before the text-only early-exit
    media_sender, media_type, media_id = _extract_media_info(payload)
    if media_sender and media_type and media_id:
        supabase_early = request.app.state.supabase_client
        athlete_early = await _find_athlete_by_phone(supabase_early, media_sender)
        if athlete_early:
            import asyncio
            # Fire-and-forget: must return 200 to Meta within 5s
            # B-01: AthleteRecord is a dataclass — convert to dict so _handle_media_message
            # can use .get() safely (was crashing with AttributeError on every media message).
            asyncio.create_task(
                _handle_media_message(
                    request,
                    supabase_early,
                    {
                        "id": athlete_early.athlete_id,
                        "athlete_id": athlete_early.athlete_id,
                        "coach_id": athlete_early.coach_id,
                        "display_name": athlete_early.display_name,
                        "stable_profile": athlete_early.stable_profile,
                        "current_state": athlete_early.current_state,
                    },
                    media_sender,
                    media_type,
                    media_id,
                )
            )
            logger.info("[COA-107] Media message (%s) from %s — analysis task queued", media_type, _mask_phone(media_sender))
            return WhatsAppWebhookResponse(status="media_queued")

    if not sender or not text:
        logger.info("[webhook] No actionable message in payload — ignoring")
        return WhatsAppWebhookResponse(status="ignored")

    supabase = request.app.state.supabase_client

    # FIX 3: Single endpoint routing — check if sender is a coach first
    coach = await _find_coach_by_phone(supabase, sender)
    if coach:
        logger.info("[webhook] Sender %s identified as coach — routing to triage", _mask_phone(sender))
        return await _handle_coach_message(request, supabase, coach, sender, text)

    # Otherwise treat as athlete
    athlete = await _find_athlete_by_phone(supabase, sender)
    if athlete:
        return await _handle_athlete_message(request, supabase, athlete, sender, text, wa_msg_id, is_voice=is_voice)

    # Check if in progress onboarding
    onboarding = await _find_onboarding_session(supabase, sender)
    if onboarding:
        logger.info("[webhook] Sender %s is in onboarding step=%s", _mask_phone(sender), onboarding.get('step'))
        return await _handle_onboarding_step(request, supabase, sender, text, onboarding)

    # Unknown number — start onboarding
    logger.info("[webhook] Unknown sender %s — starting onboarding", _mask_phone(sender))
    return await _start_onboarding(request, supabase, sender)


# ---------------------------------------------------------------------------
# COA-54: Office hours / AI autonomy helpers
# ---------------------------------------------------------------------------

_DAY_MAP = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]  # weekday() → key


def _is_outside_office_hours(coach_row: dict) -> bool:
    """Return True if current time (in coach's timezone) is outside configured office hours.

    office_hours format: {"mon": ["09:00", "18:00"], "fri": ["09:00", "13:00"], "timezone": "America/New_York"}
    Days omitted from the dict = fully autonomous that day (treat as outside hours).
    If office_hours is None/empty, always return False (no restriction configured).
    ai_autonomy_override=True always returns True (full autonomy regardless of time).
    """
    if coach_row.get("ai_autonomy_override"):
        return True

    # COA-123: schedule enforcement is opt-in. If the toggle is off, coach is
    # always treated as online (never outside hours).
    if not coach_row.get("office_hours_enabled", False):
        return False

    office_hours = coach_row.get("office_hours")
    if not office_hours or not isinstance(office_hours, dict):
        return False  # No hours configured — use normal routing

    tz_name = office_hours.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        logger.warning("[office_hours] Unknown timezone %r — defaulting to UTC", tz_name)
        tz = ZoneInfo("UTC")

    now = datetime.now(tz)
    day_key = _DAY_MAP[now.weekday()]  # e.g. "tue"
    hours = office_hours.get(day_key)

    if not hours or len(hours) < 2:
        # Day not configured — fully autonomous
        return True

    try:
        start_h, start_m = [int(x) for x in hours[0].split(":")]
        end_h, end_m = [int(x) for x in hours[1].split(":")]
        start = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
        end = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
        return not (start <= now < end)
    except Exception as exc:
        logger.warning("[office_hours] Could not parse hours %r: %s", hours, exc)
        return False


async def _fetch_coach_row(supabase: Any, coach_id: str) -> dict:
    """Fetch coach row including office_hours + ai_autonomy_override."""
    try:
        rows = await _query_rows(
            supabase.table("coaches")
            .select("id, office_hours, ai_autonomy_override, office_hours_enabled, whatsapp_number")
            .eq("id", coach_id)
            .limit(1)
        )
        return rows[0] if rows else {}
    except Exception as exc:
        logger.warning("[office_hours] Failed to fetch coach row for %s: %s", coach_id, exc)
        return {}


# ---------------------------------------------------------------------------
# Athlete flow
# ---------------------------------------------------------------------------

async def _handle_athlete_message(
    request: Request,
    supabase: Any,
    athlete: AthleteRecord,
    sender: str,
    text: str,
    wa_msg_id: str | None,
    is_voice: bool = False,
) -> WhatsAppWebhookResponse:
    _handler_t0 = time.monotonic()

    # ── COA-103: Morning pulse intercept ────────────────────────────────────
    # Check if this message is answering an active morning pulse sequence.
    # If so, handle it entirely within the pulse state machine and skip the
    # normal ack + suggestion engine — the next question IS the ack.
    try:
        from app.services.morning_pulse import is_session_active, handle_answer
        cs = athlete.current_state or {}
        pulse_state = cs.get("morning_pulse_state")
        if pulse_state and is_session_active(pulse_state):
            reply_text, is_complete, coach_summary = handle_answer(
                supabase=supabase,
                athlete_id=athlete.athlete_id,
                coach_id=athlete.coach_id,
                display_name=athlete.display_name or athlete.phone_number,
                current_state=cs,
                answer_text=text,
            )
            if reply_text:
                await _send_whatsapp_message(request, sender, reply_text)
            logger.info(
                "[COA-103] Pulse response processed for athlete=%s complete=%s",
                athlete.athlete_id[:8], is_complete,
            )
            # COA-103: Notify coach when the full pulse session is complete.
            # Previously the coach received nothing — they had no idea what the
            # athlete said until they opened the dashboard.
            if is_complete and coach_summary:
                coach_wa = athlete.coach_whatsapp_number
                if coach_wa:
                    athlete_name = athlete.display_name or "Your athlete"
                    coach_notification = (
                        f"📊 Morning pulse complete — {athlete_name}:\n"
                        f"{coach_summary}\n\n"
                        f"View full session in the dashboard."
                    )
                    await _send_whatsapp_message(request, coach_wa, coach_notification)
                    logger.info(
                        "[COA-103] Sent pulse summary to coach for athlete=%s",
                        athlete.athlete_id[:8],
                    )
                else:
                    logger.warning(
                        "[COA-103] Pulse complete for athlete=%s but no coach WhatsApp — "
                        "set COACH_WHATSAPP_NUMBER in Railway or coaches.whatsapp_number in DB",
                        athlete.athlete_id[:8],
                    )
            return WhatsAppWebhookResponse(
                status="pulse_answered",
                athlete_id=athlete.athlete_id,
                coach_id=athlete.coach_id,
            )
    except Exception as pulse_exc:
        # Non-fatal: if pulse handling fails, fall through to normal flow
        logger.warning("[COA-103] Pulse intercept failed (non-fatal): %s", pulse_exc)
    # ── End COA-103 ─────────────────────────────────────────────────────────

    # COA-56: Detect workout context before ack — affects both message wording and AI routing
    workout_context = is_voice and _detect_workout_context(text)
    if workout_context:
        logger.info("[COA-56] Workout context voice note detected for athlete=%s", athlete.athlete_id)

    # 1. Acknowledge immediately — wording depends on office hours / autonomy mode (COA-54)
    # and workout context (COA-56).
    # Fetch coach row early so we can use it for both the ack and the routing decision below.
    coach_row = await _fetch_coach_row(supabase, athlete.coach_id)
    outside_hours = _is_outside_office_hours(coach_row)

    if workout_context:
        ack_msg = "Got it 💪 Sending this to your coach now."
    elif outside_hours:
        ack_msg = (
            f"Hey {athlete.display_name or 'there'} 👋 Got your check-in! "
            "Your coach's AI assistant is on it and will reply in just a moment."
        )
    else:
        ack_msg = f"Got your check-in, {athlete.display_name or 'Athlete'}! Your coach will review it shortly."
    await _send_whatsapp_message(request, sender, ack_msg)

    # 2. Store check-in
    checkin_payload = {
        "athlete_id": athlete.athlete_id,
        "coach_id": athlete.coach_id,
        "phone_number": sender,
        "message_text": text,
        "whatsapp_message_id": wa_msg_id,
        "message_type": "text" if text != "[Audio Message]" else "voice",
    }
    checkin_id = None
    try:
        checkin_res = supabase.table("athlete_checkins").insert(apply_scope_payload(checkin_payload, _get_scope())).execute()
        checkin_id = checkin_res.data[0].get("id") if checkin_res.data else None
        logger.info("[webhook] Stored check-in: id=%s", checkin_id)
    except Exception as exc:
        logger.error("[webhook] Failed to store check-in: %s", exc)

    # COA-112: Log inbound athlete WhatsApp message to memory feed (fire-and-forget)
    try:
        supabase.table("athlete_memory_events").insert({
            "athlete_id": athlete.athlete_id,
            "event_type": "whatsapp_athlete",
            "content": text[:500],
            "metadata": {
                "checkin_id": str(checkin_id) if checkin_id else None,
                "wa_msg_id": wa_msg_id,
                "is_voice": is_voice,
            },
        }).execute()
    except Exception as mem_exc:
        logger.warning("[COA-112] Failed to log athlete WhatsApp message to memory: %s", mem_exc)

    # COA-84 + COA-91: Strava sync is now fire-and-forget — it was on the critical path
    # (up to 5s) and risked hitting Meta's 20s webhook timeout. Data is written to DB
    # and will be available in athlete.current_state on the next message.
    async def _strava_bg() -> None:
        try:
            from app.services.workout_sync import WorkoutSyncService
            strava_data = await WorkoutSyncService(supabase).fetch_latest(athlete.athlete_id)
            if strava_data:
                logger.info(
                    "[COA-84] Background Strava sync: %s %.1fkm for athlete=%s",
                    strava_data.get("strava_last_activity_type", "?"),
                    strava_data.get("strava_last_distance_km", 0.0),
                    athlete.athlete_id[:8],
                )
        except Exception as exc:
            logger.warning("[COA-84] Background Strava sync failed (non-fatal): %s", exc)

    asyncio.ensure_future(_strava_bg())

    # 3. Generate structured AI decision (COA-47 + COA-56 workout context)
    decision = await _generate_ai_decision(athlete, text, supabase, workout_context=workout_context)
    suggestion_text = decision.get("reply", "")
    auto_send = decision.get("auto_send", False)
    urgency = decision.get("urgency", "flag")
    workout_adjustment = decision.get("workout_adjustment")
    # adjustment_reason is internal only — stored in DB, never surfaced in WhatsApp

    # COA-54: Office hours override — if coach is outside office hours or has autonomy
    # override enabled, force auto_send=True so the AI handles it without coach review.
    # Exception: urgent messages ALWAYS notify the coach (but also auto-reply to athlete).
    # Note: coach_row and outside_hours already fetched above for the ack message.
    if outside_hours and urgency != "urgent":
        if not auto_send:
            logger.info(
                "[office_hours] Outside coach hours — forcing auto_send=True for athlete=%s urgency=%s",
                athlete.athlete_id, urgency,
            )
        auto_send = True

    # 4. Store suggestion (full decision JSON stored in `suggestion` JSONB field for dashboard)
    suggestion_payload = {
        "athlete_id": athlete.athlete_id,
        "coach_id": athlete.coach_id,
        "athlete_display_name": athlete.display_name,
        "athlete_phone_number": sender,
        "suggestion": decision,          # full structured decision for dashboard
        "suggestion_text": suggestion_text,
        "status": "pending",
        "source": "whatsapp_checkin",
    }
    suggestion_id = None
    try:
        suggestion_res = supabase.table("suggestions").insert(
            apply_scope_payload(suggestion_payload, _get_scope())
        ).execute()
        suggestion_id = suggestion_res.data[0].get("id") if suggestion_res.data else None
        logger.info("[webhook] Stored suggestion: id=%s urgency=%s auto_send=%s", suggestion_id, urgency, auto_send)
    except Exception as exc:
        logger.error("[webhook] Failed to store suggestion: %s", exc)

    # 4b. Write workout adjustment to workouts table if AI recommended one
    if workout_adjustment and athlete.athlete_id:
        try:
            from datetime import date as _date
            adj_payload = {
                "athlete_id": athlete.athlete_id,
                "coach_id": athlete.coach_id,
                "scheduled_date": _date.today().isoformat(),
                "session_type": workout_adjustment.get("session_type", ""),
                "duration_min": workout_adjustment.get("duration_min"),
                "distance_km": workout_adjustment.get("distance_km"),
                "hr_zone": workout_adjustment.get("hr_zone"),
                "coaching_notes": workout_adjustment.get("coaching_notes", ""),
                "status": "pending",
                "source": "ai_adjustment",
                "suggestion_id": suggestion_id,
            }
            supabase.table("workouts").insert(
                apply_scope_payload({k: v for k, v in adj_payload.items() if v is not None}, _get_scope())
            ).execute()
            logger.info("[webhook] Wrote AI workout adjustment for athlete=%s", athlete.athlete_id)
        except Exception as exc:
            logger.error("[webhook] Failed to write workout adjustment: %s", exc)

    # 5. Link check-in to suggestion
    if checkin_id and suggestion_id:
        try:
            supabase.table("athlete_checkins").update({
                "suggestion_id": suggestion_id,
                "processed": True,
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", checkin_id).execute()
        except Exception as exc:
            logger.error("[webhook] Failed to link check-in to suggestion: %s", exc)

    # 6. Route based on urgency + auto_send (Poke principle: no reasoning in WhatsApp)
    coach_wa = athlete.coach_whatsapp_number
    athlete_name = athlete.display_name or "Unknown Athlete"

    if urgency == "urgent":
        # Immediate coach alert — always notify coach regardless of office hours
        if coach_wa:
            hours_note = " (AI is in autonomous mode — reply was also sent to athlete)" if outside_hours else ""
            alert_msg = (
                f"🚨 URGENT — {athlete_name} needs immediate attention.{hours_note}\n"
                f"Message: \"{text[:200]}\"\n\n"
                f"Reply to send them a message."
            )
            await _send_whatsapp_message(request, coach_wa, alert_msg)
            logger.info("[webhook] Sent URGENT coach alert for athlete=%s", athlete.athlete_id)
        # COA-54: Outside office hours → also auto-reply to athlete so they're not left waiting
        if outside_hours and suggestion_text:
            await _send_whatsapp_message(request, sender, suggestion_text)
            logger.info("[webhook] URGENT outside hours — auto-replied to athlete=%s", athlete.athlete_id)
        elif not outside_hours:
            # Inside hours — hold for coach, as before
            logger.warning("[webhook] URGENT: holding auto-reply for athlete=%s", athlete.athlete_id)

    elif auto_send:
        # Routine check-in — send AI reply directly to athlete, silent note to coach
        if suggestion_text:
            await _send_whatsapp_message(request, sender, suggestion_text)
            logger.info("[webhook] Auto-sent AI reply to athlete=%s", athlete.athlete_id)
            # COA-112: Log AI auto-reply to athlete's memory feed
            try:
                supabase.table("athlete_memory_events").insert({
                    "athlete_id": athlete.athlete_id,
                    "event_type": "whatsapp_coach",
                    "content": suggestion_text[:500],
                    "metadata": {
                        "suggestion_id": str(suggestion_id) if suggestion_id else None,
                        "auto_send": True,
                    },
                }).execute()
            except Exception as mem_exc:
                logger.warning("[COA-112] Failed to log AI auto-reply to memory: %s", mem_exc)
        if coach_wa:
            if workout_adjustment:
                adj_summary = (
                    f"{workout_adjustment.get('session_type', '')} "
                    f"{workout_adjustment.get('duration_min', '')}min"
                ).strip()
                coach_note = (
                    f"✅ Auto-sent reply to {athlete_name}.\n"
                    f"AI adjusted today's workout: {adj_summary}\n"
                    f"Full detail in dashboard."
                )
            else:
                ref = _suggestion_ref(suggestion_id) if suggestion_id else "????"
                coach_note = f"✅ Auto-sent reply to {athlete_name} [#{ref}] — routine check-in."
            await _send_whatsapp_message(request, coach_wa, coach_note)

    else:
        # Coach review required — send full draft to coach (clean, no reasoning)
        if coach_wa:
            if workout_adjustment:
                adj_summary = (
                    f"{workout_adjustment.get('session_type', '')} "
                    f"{workout_adjustment.get('duration_min', '')}min"
                ).strip()
                adj_line = f"\n⚡ AI workout adjustment: {adj_summary} — see dashboard for detail."
            else:
                adj_line = ""
            ref = _suggestion_ref(suggestion_id) if suggestion_id else "????"
            # COA-56: Add 🎙️ mid-workout indicator so coach knows to respond fast
            workout_label = "🎙️ MID-WORKOUT voice note" if workout_context else "Check-in"
            coach_notification = (
                f"{workout_label} from {athlete_name} [#{ref}]:\n"
                f"\"{text[:300]}\"\n\n"
                f"AI draft reply:\n{suggestion_text}{adj_line}\n\n"
                f"Reply \"APPROVE #{ref}\" to send, or reply with your own message to override.\n"
                f"Reply \"QUEUE\" to see all pending."
            )
            await _send_whatsapp_message(request, coach_wa, coach_notification)
            logger.info("[webhook] Sent coach review notification for athlete=%s workout_context=%s",
                        athlete.athlete_id, workout_context)
        else:
            logger.warning(
                "[webhook] No coach WhatsApp number found — skipping coach notification. "
                "Fix: set coaches.whatsapp_number in Supabase for coach_id=%s "
                "OR set COACH_WHATSAPP_NUMBER env var in Railway (E.164: +12025551234).",
                athlete.coach_id,
            )

    # 7. COA-43: Persist check-in state to memory_states so future AI calls have
    # a running record of this athlete's readiness trends. Wrapped in try/except
    # so a failure here never breaks the webhook response.
    try:
        cs = athlete.current_state or {}
        # Oura-synced values take priority; fall back to coach-entered values
        readiness_raw = cs.get("oura_readiness_score") if cs.get("oura_readiness_score") is not None else cs.get("last_readiness_score")
        readiness = max(0, min(100, int(float(readiness_raw)))) if readiness_raw is not None else 70

        soreness_raw = cs.get("soreness")
        try:
            soreness = max(0, min(10, int(float(str(soreness_raw))))) if soreness_raw is not None else 5
        except (ValueError, TypeError):
            soreness = 5

        oura_hrv = cs.get("oura_avg_hrv") if cs.get("oura_avg_hrv") is not None else cs.get("last_hrv")
        if oura_hrv is not None:
            hrv_ms = float(oura_hrv)
            hrv_status = "below" if hrv_ms < 50 else ("above" if hrv_ms > 80 else "normal")
        else:
            hrv_status = "normal"

        # Oura sleep score (0–100) → approximate hours (max ~9h)
        sleep_score = cs.get("oura_sleep_score") if cs.get("oura_sleep_score") is not None else cs.get("last_sleep_score")
        sleep_hours = round((float(sleep_score) / 100) * 9.0, 1) if sleep_score is not None else 7.5

        check_in_obj = AthleteCheckIn(
            athlete_id=athlete.athlete_id,
            readiness=readiness,
            hrv=hrv_status,
            sleep_hours=sleep_hours,
            sleep_quality="good" if sleep_hours >= 7 else "poor",
            soreness=soreness,
        )
        recommendation = assess_check_in(check_in_obj)
        persisted = persist_check_in_state(
            check_in_obj,
            recommendation,
            coach_id=athlete.coach_id,
        )
        if persisted:
            logger.info(
                "[webhook] Persisted memory state for athlete=%s action=%s",
                athlete.athlete_id, recommendation.recommended_action,
            )
        else:
            logger.warning(
                "[webhook] persist_check_in_state returned False for athlete=%s — "
                "check SUPABASE env vars and scope config",
                athlete.athlete_id,
            )
    except Exception as exc:
        logger.warning(
            "[webhook] Failed to persist check-in memory state for athlete=%s: %s",
            athlete.athlete_id, exc,
        )

    # COA-83: Append memory event + fire-and-forget summary refresh (non-blocking)
    try:
        from app.services.memory_service import MemoryService
        from starlette.concurrency import run_in_threadpool

        mem = MemoryService(supabase)
        await run_in_threadpool(
            mem.append_event,
            athlete.athlete_id,
            "message",
            text[:2000],
            {"suggestion_id": suggestion_id, "urgency": urgency, "is_voice": is_voice},
        )

        async def _refresh_bg() -> None:
            try:
                await run_in_threadpool(mem.refresh_summary, athlete.athlete_id)
            except Exception as _exc:
                logger.warning("[memory] Background refresh failed for athlete=%s: %s", athlete.athlete_id[:8], _exc)

        asyncio.ensure_future(_refresh_bg())
    except Exception as exc:
        logger.warning("[memory] Memory pipeline failed for athlete=%s: %s", athlete.athlete_id[:8], exc)

    _handler_ms = int((time.monotonic() - _handler_t0) * 1000)
    logger.info(
        "[COA-91] Athlete check-in processed: athlete=%s checkin_id=%s suggestion_id=%s total_latency=%dms",
        athlete.athlete_id, checkin_id, suggestion_id, _handler_ms,
    )
    return WhatsAppWebhookResponse(
        status="processed",
        athlete_id=athlete.athlete_id,
        coach_id=athlete.coach_id,
        message_id=wa_msg_id,
    )


# ---------------------------------------------------------------------------
# Coach triage flow (FIX 3: now handled inside the single /whatsapp endpoint)
# ---------------------------------------------------------------------------

def _suggestion_ref(suggestion_id: str) -> str:
    """Return a short 4-char hex reference from a UUID for use in WhatsApp messages."""
    return suggestion_id.replace("-", "")[:4].lower()


async def _handle_coach_message(
    request: Request,
    supabase: Any,
    coach: dict,
    sender: str,
    text: str,
) -> WhatsAppWebhookResponse:
    """COA-49: Handle incoming coach WhatsApp message.

    Supported commands:
      APPROVE [#ref]   -- approve AI draft for most recent (or specific) pending suggestion
      <custom text>    -- send custom reply to oldest pending athlete
      QUEUE / STATUS   -- list all pending suggestions with ref codes
    """
    import re as _re
    coach_id = coach.get("id")
    cmd = text.strip()

    # COA-121: SEND [name]: [message] -- coach-initiated message to a specific athlete
    # Syntax: "SEND Patrick: How are you feeling this week?"
    send_match = _re.match(r"^SEND\s+([^:]+):\s*(.+)$", cmd, _re.IGNORECASE | _re.DOTALL)
    if send_match:
        target_name = send_match.group(1).strip()
        outbound_text = send_match.group(2).strip()
        try:
            all_athletes = await _query_rows(
                supabase.table("athletes")
                .select("id, full_name, phone_number")
                .eq("coach_id", coach_id)
                .is_("archived_at", "null")
                .limit(50)
            )
        except Exception as exc:
            logger.error("[webhook][COA-121] Athlete list fetch failed: %s", exc)
            all_athletes = []

        # Fuzzy name match (case-insensitive, first name or full name)
        matched = None
        target_lower = target_name.lower()
        for a in all_athletes:
            full = (a.get("full_name") or "").lower()
            first = full.split()[0] if full else ""
            if target_lower == full or target_lower == first or target_lower in full:
                matched = a
                break

        if not matched:
            names = ", ".join(a.get("full_name", "?") for a in all_athletes[:8])
            await _send_whatsapp_message(
                request, sender,
                f"⚠️ No athlete found matching '{target_name}'.\nYour roster: {names}"
            )
            return WhatsAppWebhookResponse(status="athlete_not_found", coach_id=str(coach_id))

        athlete_phone = matched.get("phone_number") or ""
        athlete_name = matched.get("full_name") or target_name
        athlete_id_send = matched.get("id")

        if not athlete_phone:
            await _send_whatsapp_message(
                request, sender,
                f"⚠️ {athlete_name} has no phone number on file."
            )
            return WhatsAppWebhookResponse(status="no_phone", coach_id=str(coach_id))

        await _send_whatsapp_message(request, athlete_phone, outbound_text)

        # Log to memory
        try:
            supabase.table("athlete_memory_events").insert({
                "athlete_id": str(athlete_id_send),
                "event_type": "whatsapp_coach",
                "content": outbound_text[:500],
                "metadata": {"coach_initiated": True, "via": "whatsapp_command"},
            }).execute()
        except Exception as mem_exc:
            logger.warning("[COA-121] Memory log failed: %s", mem_exc)

        await _send_whatsapp_message(
            request, sender,
            f"✓ Sent to {athlete_name}:\n\"{outbound_text[:80]}{'…' if len(outbound_text) > 80 else ''}\""
        )
        return WhatsAppWebhookResponse(status="coach_message_sent", coach_id=str(coach_id))

    # QUEUE / STATUS -- list pending suggestions
    if cmd.upper() in ("QUEUE", "STATUS", "LIST"):
        try:
            all_pending = await _query_rows(
                apply_scope_query(
                    supabase.table("suggestions")
                    .select("id, athlete_display_name, suggestion_text, created_at")
                    .eq("coach_id", coach_id)
                    .eq("status", "pending")
                    .order("created_at", desc=False)
                    .limit(10),
                    _get_scope(),
                )
            )
        except Exception as exc:
            logger.error("[webhook] QUEUE fetch failed for coach %s: %s", coach_id, exc)
            all_pending = []

        if not all_pending:
            await _send_whatsapp_message(request, sender, "\u2705 No pending check-ins right now.")
            return WhatsAppWebhookResponse(status="no_pending_suggestion", coach_id=str(coach_id))

        lines = [f"\U0001f4cb Pending ({len(all_pending)}):"]
        for s in all_pending:
            ref = _suggestion_ref(s["id"])
            name = s.get("athlete_display_name") or "Unknown"
            preview = (s.get("suggestion_text") or "")[:60]
            dt = (s.get("created_at") or "")[:10]
            lines.append(f"[#{ref}] {name} ({dt})\nDraft: {preview}\u2026")
        lines.append("\nReply \"APPROVE #ref\" or \"APPROVE\" for the oldest.")
        await _send_whatsapp_message(request, sender, "\n\n".join(lines))
        return WhatsAppWebhookResponse(status="queue_listed", coach_id=str(coach_id))

    # Parse APPROVE [#ref] or treat as custom reply
    approve_match = _re.match(r"^APPROVE\s*#?([a-f0-9]{4})?$", cmd, _re.IGNORECASE)
    is_approve = bool(approve_match)
    ref_code = approve_match.group(1).lower() if (approve_match and approve_match.group(1)) else None

    # Fetch pending suggestions -- oldest first so default targets oldest unhandled
    try:
        all_pending = await _query_rows(
            apply_scope_query(
                supabase.table("suggestions")
                .select("*")
                .eq("coach_id", coach_id)
                .eq("status", "pending")
                .order("created_at", desc=False)
                .limit(20),
                _get_scope(),
            )
        )
    except Exception as exc:
        logger.error("[webhook] Failed to query suggestions for coach %s: %s", coach_id, exc)
        all_pending = []

    if not all_pending:
        await _send_whatsapp_message(request, sender, "No pending athlete check-ins right now.")
        return WhatsAppWebhookResponse(status="no_pending_suggestion", coach_id=str(coach_id))

    # Pick target suggestion -- by ref code or oldest
    suggestion = None
    if ref_code:
        for s in all_pending:
            if _suggestion_ref(s["id"]) == ref_code:
                suggestion = s
                break
        if not suggestion:
            await _send_whatsapp_message(
                request, sender,
                f"Couldn\'t find a pending check-in with ref #{ref_code}. "
                "Reply QUEUE to see all pending."
            )
            return WhatsAppWebhookResponse(status="ref_not_found", coach_id=str(coach_id))
    else:
        suggestion = all_pending[0]

    athlete_phone = suggestion.get("athlete_phone_number")
    suggestion_id = suggestion.get("id")
    athlete_name = suggestion.get("athlete_display_name") or "the athlete"

    # Determine reply body
    if is_approve:
        reply_body = suggestion.get("suggestion_text", "")
        action = "approved AI draft"
        logger.info("[webhook][COA-49] Coach APPROVED suggestion=%s athlete=%s", suggestion_id, athlete_name)
    else:
        reply_body = cmd
        action = "sent custom reply"
        logger.info("[webhook][COA-49] Coach CUSTOM reply for suggestion=%s athlete=%s", suggestion_id, athlete_name)

    if not reply_body:
        await _send_whatsapp_message(request, sender, "\u26a0\ufe0f No reply text found -- nothing sent.")
        return WhatsAppWebhookResponse(status="empty_reply", coach_id=str(coach_id))

    # Send to athlete
    if athlete_phone:
        await _send_whatsapp_message(request, athlete_phone, reply_body)
        logger.info("[webhook][COA-49] Reply sent to athlete at %s", _mask_phone(athlete_phone))
        # COA-112: Log coach reply to athlete's memory feed
        try:
            athlete_id_for_memory = suggestion.get("athlete_id")
            if athlete_id_for_memory:
                supabase.table("athlete_memory_events").insert({
                    "athlete_id": str(athlete_id_for_memory),
                    "event_type": "whatsapp_coach",
                    "content": reply_body[:500],
                    "metadata": {
                        "suggestion_id": str(suggestion_id) if suggestion_id else None,
                        "action": action,
                    },
                }).execute()
        except Exception as mem_exc:
            logger.warning("[COA-112] Failed to log coach reply to athlete memory: %s", mem_exc)
    else:
        logger.warning("[webhook][COA-49] No athlete phone for suggestion=%s -- skipping send", suggestion_id)

    # Update suggestion status
    try:
        supabase.table("suggestions").update({
            "status": "completed",
            "coach_reply": reply_body,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", suggestion_id).execute()
    except Exception as exc:
        logger.error("[webhook][COA-49] Failed to update suggestion status: %s", exc)

    # Confirmation to coach -- include remaining queue count and next pending
    try:
        remaining = len(all_pending) - 1
        preview = reply_body[:80] + "\u2026" if len(reply_body) > 80 else reply_body
        queue_note = f"\n{remaining} more pending." if remaining > 0 else "\n\u2705 Queue clear."
        confirmation = f"\u2713 {action} \u2192 {athlete_name}:\n\"{preview}\"{queue_note}"
        if remaining > 0:
            next_s = next((s for s in all_pending if s["id"] != suggestion_id), None)
            if next_s:
                next_ref = _suggestion_ref(next_s["id"])
                next_name = next_s.get("athlete_display_name") or "Unknown"
                confirmation += f"\nNext: {next_name} [#{next_ref}]"
        await _send_whatsapp_message(request, sender, confirmation)
    except Exception as exc:
        logger.warning("[webhook][COA-49] Failed to send coach confirmation: %s", exc)

    return WhatsAppWebhookResponse(status="sent", coach_id=str(coach_id))
