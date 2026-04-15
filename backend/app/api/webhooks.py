"""Webhook routes for athlete check-in flow."""
from __future__ import annotations

import inspect
import json
import logging
import os
import secrets
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
            supabase_client.table("athletes").select("*").eq("phone_number", value)
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

    from datetime import date as _date
    today = _date.today()
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


async def _build_system_prompt(athlete: AthleteRecord, supabase: Any) -> str:
    """Build a rich system prompt using athlete profile, current state, and coach methodology (COA-25)."""
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

    prompt = "".join(prompt_parts)
    logger.info(
        "[webhook] Built system prompt: %d chars, %d profile fields, %d state fields",
        len(prompt), len(athlete_context_parts), len(state_parts),
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
    athlete: AthleteRecord, text: str, supabase: Any = None
) -> dict:
    """COA-47: Generate a structured AI coaching decision.

    Returns a dict with keys: reply, workout_adjustment, adjustment_reason, urgency, auto_send.
    Reasoning (adjustment_reason) is NEVER included in WhatsApp messages — stored in DB only.
    """
    settings = get_settings()
    groq_api_key = getattr(settings, "groq_api_key", None)
    if not groq_api_key:
        logger.warning("[webhook] GROQ_API_KEY not set — using fallback decision")
        return dict(_AI_DECISION_FALLBACK)

    if supabase:
        system_prompt = await _build_system_prompt(athlete, supabase)
    else:
        system_prompt = (
            f"You are an expert endurance sports coach AI. "
            f"Draft a concise, supportive reply FROM the coach TO {athlete.display_name or 'the athlete'}."
        )

    full_system = f"{system_prompt}\n\n{_AI_DECISION_SYSTEM}"
    user_prompt = f'Athlete check-in message: "{text}"\n\nProduce your structured coaching decision as JSON:'

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": full_system},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            decision = json.loads(raw)

            # Safety overrides — enforce regardless of what the model returned
            if decision.get("urgency") == "urgent":
                decision["auto_send"] = False
            if decision.get("workout_adjustment") is not None:
                decision["auto_send"] = False

            logger.info(
                "[webhook] AI decision: urgency=%s auto_send=%s adjustment=%s",
                decision.get("urgency"),
                decision.get("auto_send"),
                "yes" if decision.get("workout_adjustment") else "no",
            )
            return decision

    except json.JSONDecodeError as exc:
        logger.error("[webhook] AI decision JSON parse failed: %s", exc)
        return dict(_AI_DECISION_FALLBACK)
    except Exception as exc:
        logger.error("[webhook] AI decision failed: %s", exc)
        return dict(_AI_DECISION_FALLBACK)


async def _generate_suggestion(athlete: AthleteRecord, text: str, supabase: Any = None) -> str:
    """Backward-compatible shim — callers not yet updated to structured decisions."""
    decision = await _generate_ai_decision(athlete, text, supabase)
    return decision.get("reply", _AI_DECISION_FALLBACK["reply"])


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


async def _extract_message(payload: dict) -> tuple[str | None, str | None, str | None]:
    """Extract (sender, text, wa_msg_id) from a WhatsApp webhook payload."""
    if "entry" not in payload:
        return None, None, None
    for entry in payload["entry"]:
        for change in entry.get("changes", []):
            val = change.get("value", {})
            if "messages" not in val:
                continue
            msg = val["messages"][0]
            sender = msg.get("from")
            wa_msg_id = msg.get("id")
            msg_type = msg.get("type")
            if msg_type == "text":
                text = msg.get("text", {}).get("body")
            elif msg_type in ("audio", "voice"):
                text = "[Audio Message]"
                media_id = msg.get("audio", {}).get("id") or msg.get("voice", {}).get("id")
                has_api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY")
                if media_id and has_api_key:
                    try:
                        audio_bytes = await _download_whatsapp_audio(media_id)
                        from app.services.audio_service import AudioMemoInput, AudioService
                        result = AudioService().process_voice_memo(
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
            return sender, text, wa_msg_id
    return None, None, None


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
    supabase.table("onboarding_sessions").insert({
        "phone_number": sender,
        "step": "ask_name",
        "collected": {},
    }).execute()

    await _send_whatsapp_message(
        request, sender,
        "Welcome to Coach.AI! \U0001f3cb\ufe0f\n"
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
            base_url = "https://coach-ai-production-a5aa.up.railway.app"
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
            base_url = "https://coach-ai-production-a5aa.up.railway.app"
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
    if hub_verify_token == get_settings().whatsapp_verify_token:
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

    settings = get_settings()
    try:
        verify_whatsapp_signature(request, raw_body)
    except HTTPException as exc:
        logger.error("[webhook] Signature verification failed: %s", exc.detail)
        raise

    content_type = (request.headers.get("content-type") or "").lower()
    payload = _parse_payload(raw_body, content_type)

    sender, text, wa_msg_id = await _extract_message(payload)

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
        return await _handle_athlete_message(request, supabase, athlete, sender, text, wa_msg_id)

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
            .select("id, office_hours, ai_autonomy_override, whatsapp_number")
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
) -> WhatsAppWebhookResponse:
    # 1. Acknowledge immediately
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

    # 3. Generate structured AI decision (COA-47)
    decision = await _generate_ai_decision(athlete, text, supabase)
    suggestion_text = decision.get("reply", "")
    auto_send = decision.get("auto_send", False)
    urgency = decision.get("urgency", "flag")
    workout_adjustment = decision.get("workout_adjustment")
    # adjustment_reason is internal only — stored in DB, never surfaced in WhatsApp

    # COA-54: Office hours override — if coach is outside office hours or has autonomy
    # override enabled, force auto_send=True so the AI handles it without coach review.
    # Exception: urgent messages ALWAYS notify the coach (but also auto-reply to athlete).
    coach_row = await _fetch_coach_row(supabase, athlete.coach_id)
    outside_hours = _is_outside_office_hours(coach_row)
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
            coach_notification = (
                f"Check-in from {athlete_name} [#{ref}]:\n"
                f"\"{text[:300]}\"\n\n"
                f"AI draft reply:\n{suggestion_text}{adj_line}\n\n"
                f"Reply \"APPROVE #{ref}\" to send, or reply with your own message to override.\n"
                f"Reply \"QUEUE\" to see all pending."
            )
            await _send_whatsapp_message(request, coach_wa, coach_notification)
            logger.info("[webhook] Sent coach review notification for athlete=%s", athlete.athlete_id)
        else:
            logger.warning("[webhook] No coach WhatsApp number found — skipping coach notification")

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

    logger.info(
        "[webhook] Athlete check-in processed: athlete=%s checkin_id=%s suggestion_id=%s",
        athlete.athlete_id, checkin_id, suggestion_id,
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
