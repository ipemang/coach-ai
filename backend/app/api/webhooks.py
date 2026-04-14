"""Webhook routes for athlete check-in flow."""
from __future__ import annotations

import inspect
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.security import verify_whatsapp_signature

logger = logging.getLogger(__name__)
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
    logger.info("[webhook] Looking up athlete by phone variants: %s", variants)
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
    logger.warning("[webhook] No athlete found for phone variants: %s", variants)
    return None


async def _find_coach_by_phone(supabase_client: Any, phone_number: str) -> dict | None:
    """Return the coach row if sender is a registered coach, else None."""
    variants = _phone_variants(phone_number)
    logger.info("[webhook] Looking up coach by phone variants: %s", variants)
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
        logger.warning("[webhook] whatsapp_client not available — cannot send to %s", to)
        return
    try:
        await whatsapp_client.send_message(to, body)
        logger.info("[webhook] Sent WhatsApp message to %s", to)
    except Exception as exc:
        logger.error("[webhook] Failed to send WhatsApp message to %s: %s", to, exc)


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

    base = coach_persona or (
        "You are an expert endurance sports coach assistant. "
        "Draft a concise, supportive, professional reply FROM the coach TO the athlete. "
        "Keep it under 3 sentences. Be specific and data-driven when biometric data is available."
    )
    prompt_parts = [base]
    if coach_rules:
        prompt_parts.append(f"

Coaching methodology:
{coach_rules}")
    if athlete_context_parts:
        prompt_parts.append(
            f"

Athlete profile for {athlete.display_name or 'this athlete'}:
"
            + "
".join(f"- {p}" for p in athlete_context_parts)
        )
    if state_parts:
        prompt_parts.append("

Current athlete state:
" + "
".join(f"- {p}" for p in state_parts))

    prompt = "".join(prompt_parts)
    logger.info(
        "[webhook] Built system prompt: %d chars, %d profile fields, %d state fields",
        len(prompt), len(athlete_context_parts), len(state_parts),
    )
    return prompt


async def _generate_suggestion(athlete: AthleteRecord, text: str, supabase: Any = None) -> str:
    settings = get_settings()
    groq_api_key = getattr(settings, "groq_api_key", None)
    if not groq_api_key:
        logger.warning("[webhook] GROQ_API_KEY not set — returning fallback suggestion")
        return "Coach, the athlete shared an update. Please review their check-in."

    if supabase:
        system_prompt = await _build_system_prompt(athlete, supabase)
    else:
        system_prompt = (
            f"You are an expert endurance sports coach assistant. "
            f"Draft a concise, supportive reply FROM the coach TO {athlete.display_name or 'the athlete'}. "
            "Keep it under 3 sentences."
        )

    user_prompt = f'Athlete check-in message: "{text}"

Draft a coaching reply:'
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
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
            suggestion = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            logger.info("[webhook] AI suggestion generated (%d chars)", len(suggestion))
            return suggestion
    except Exception as exc:
        logger.error("[webhook] AI suggestion failed: %s", exc)
        return "Coach, please review the new athlete check-in."


def _extract_message(payload: dict) -> tuple[str | None, str | None, str | None]:
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
            else:
                text = None
            return sender, text, wa_msg_id
    return None, None, None


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
    if getattr(settings, "whatsapp_webhook_secret", None):
        try:
            verify_whatsapp_signature(request, raw_body)
        except HTTPException as exc:
            logger.error("[webhook] Signature verification failed: %s", exc.detail)
            raise

    content_type = (request.headers.get("content-type") or "").lower()
    payload = _parse_payload(raw_body, content_type)

    sender, text, wa_msg_id = _extract_message(payload)

    if not sender or not text:
        logger.info("[webhook] No actionable message in payload — ignoring")
        return WhatsAppWebhookResponse(status="ignored")

    supabase = request.app.state.supabase_client

    # FIX 3: Single endpoint routing — check if sender is a coach first
    coach = await _find_coach_by_phone(supabase, sender)
    if coach:
        logger.info("[webhook] Sender %s identified as coach — routing to triage", sender)
        return await _handle_coach_message(request, supabase, coach, sender, text)

    # Otherwise treat as athlete
    athlete = await _find_athlete_by_phone(supabase, sender)
    if not athlete:
        logger.warning("[webhook] Sender %s not recognized as athlete or coach — ignoring", sender)
        return WhatsAppWebhookResponse(status="ignored")

    return await _handle_athlete_message(request, supabase, athlete, sender, text, wa_msg_id)


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
        checkin_res = supabase.table("athlete_checkins").insert(checkin_payload).execute()
        checkin_id = checkin_res.data[0].get("id") if checkin_res.data else None
        logger.info("[webhook] Stored check-in: id=%s", checkin_id)
    except Exception as exc:
        logger.error("[webhook] Failed to store check-in: %s", exc)

    # 3. Generate AI suggestion
    suggestion_text = await _generate_suggestion(athlete, text, supabase)

    # 4. Store suggestion
    suggestion_payload = {
        "athlete_id": athlete.athlete_id,
        "coach_id": athlete.coach_id,
        "athlete_display_name": athlete.display_name,
        "athlete_phone_number": sender,
        "suggestion": {"reply": suggestion_text},
        "suggestion_text": suggestion_text,
        "status": "pending",
        "source": "whatsapp_checkin",
    }
    suggestion_id = None
    try:
        suggestion_res = supabase.table("suggestions").insert(suggestion_payload).execute()
        suggestion_id = suggestion_res.data[0].get("id") if suggestion_res.data else None
        logger.info("[webhook] Stored suggestion: id=%s", suggestion_id)
    except Exception as exc:
        logger.error("[webhook] Failed to store suggestion: %s", exc)

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

    # 6. Notify coach
    coach_wa = athlete.coach_whatsapp_number
    if coach_wa:
        athlete_name = athlete.display_name or "Unknown Athlete"
        coach_notification = (
            f"New check-in from {athlete_name}:\n"
            f"\"{text}\"\n\n"
            f"AI draft reply:\n{suggestion_text}\n\n"
            f"Reply APPROVE to send this, or reply with your own message to override."
        )
        await _send_whatsapp_message(request, coach_wa, coach_notification)
        logger.info("[webhook] Notified coach at %s", coach_wa)
    else:
        logger.warning("[webhook] No coach WhatsApp number found — skipping coach notification")

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

async def _handle_coach_message(
    request: Request,
    supabase: Any,
    coach: dict,
    sender: str,
    text: str,
) -> WhatsAppWebhookResponse:
    coach_id = coach.get("id")

    # Find most recent pending suggestion for this coach
    try:
        sugg_rows = await _query_rows(
            supabase.table("suggestions")
            .select("*")
            .eq("coach_id", coach_id)
            .eq("status", "pending")
            .order("created_at", descending=True)
            .limit(1)
        )
    except Exception as exc:
        logger.error("[webhook] Failed to query suggestions for coach %s: %s", coach_id, exc)
        sugg_rows = []

    if not sugg_rows:
        logger.info("[webhook] No pending suggestions for coach %s", coach_id)
        await _send_whatsapp_message(request, sender, "No pending athlete check-ins to review right now.")
        return WhatsAppWebhookResponse(status="no_pending_suggestion", coach_id=str(coach_id))

    suggestion = sugg_rows[0]
    athlete_phone = suggestion.get("athlete_phone_number")
    suggestion_id = suggestion.get("id")

    if text.strip().upper() == "APPROVE":
        reply_body = suggestion.get("suggestion_text", "")
        logger.info("[webhook] Coach approved AI suggestion for suggestion_id=%s", suggestion_id)
    else:
        reply_body = text
        logger.info("[webhook] Coach overrode suggestion with custom reply for suggestion_id=%s", suggestion_id)

    # Send to athlete
    if athlete_phone:
        await _send_whatsapp_message(request, athlete_phone, reply_body)

    # Update suggestion status
    try:
        supabase.table("suggestions").update({
            "status": "completed",
            "coach_reply": reply_body,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", suggestion_id).execute()
    except Exception as exc:
        logger.error("[webhook] Failed to update suggestion status: %s", exc)

    logger.info("[webhook] Coach reply sent to athlete at %s", athlete_phone)
    return WhatsAppWebhookResponse(status="sent", coach_id=str(coach_id))
