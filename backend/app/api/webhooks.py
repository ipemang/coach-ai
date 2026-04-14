"""Webhook routes for coach-driven flow."""
from __future__ import annotations
import inspect
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from app.core.config import get_settings
from app.core.security import verify_whatsapp_signature
from app.services.scope import DataScope, apply_scope_query, resolve_scope_from_env
from app.services.whatsapp_service import WhatsAppRecipient, WhatsAppService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

@dataclass(slots=True)
class AthleteRecord:
    athlete_id: str
    phone_number: str
    timezone_name: str
    display_name: str | None = None
    organization_id: str | None = None
    coach_id: str | None = None
    age_years: int | None = None
    training_age_years: float | None = None
    biological_baseline: dict[str, Any] = field(default_factory=dict)
    missing_fields: list[str] = field(default_factory=list)

class WhatsAppWebhookResponse(BaseModel):
    status: str
    matched_coach: bool = False
    coach_id: str | None = None
    phone_number: str | None = None
    inbound_text: str | None = None
    reply_sent: bool = False
    provider_message_id: str | None = None
    reply_body: str | None = None
    delivery_error: str | None = None

async def _read_payload(request: Request) -> dict[str, Any]:
    content_type = (request.headers.get("content-type") or "").lower()
    raw_body = await request.body()
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
    """Generate all plausible formats for a phone number to match DB entries."""
    raw = phone_number.strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    variants = set()
    # Add the raw value as-is
    variants.add(raw)
    # Add pure digits
    variants.add(digits)
    # Add with + prefix
    variants.add(f"+{digits}")
    # If digits look like a US/CA number (11 digits starting with 1), also try 10-digit
    if len(digits) == 11 and digits.startswith("1"):
        variants.add(digits[1:])           # 10-digit without country code
        variants.add(f"+1{digits[1:]}")    # +1XXXXXXXXXX
    # If digits are 10 digits (no country code), also try with +1
    if len(digits) == 10:
        variants.add(f"1{digits}")         # 11-digit with leading 1
        variants.add(f"+1{digits}")        # +1XXXXXXXXXX
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

async def _find_coach_by_phone(supabase_client: Any, phone_number: str) -> dict[str, Any] | None:
    variants = _phone_variants(phone_number)
    logger.info("[webhook] Looking up coach by phone variants: %s", variants)
    for value in variants:
        rows = await _query_rows(supabase_client.table("coaches").select("*").eq("phone_number", value))
        if rows:
            logger.info("[webhook] Found coach for variant '%s': id=%s", value, rows[0].get("id"))
            return rows[0]
    logger.warning("[webhook] No coach found for phone %s (tried variants: %s)", phone_number, variants)
    return None

async def _find_first_athlete(supabase_client: Any, coach_id: str) -> AthleteRecord | None:
    rows = await _query_rows(supabase_client.table("athletes").select("*").eq("coach_id", coach_id).limit(1))
    if not rows:
        logger.warning("[webhook] No athlete found for coach_id=%s", coach_id)
        return None
    row = rows[0]
    return AthleteRecord(
        athlete_id=str(row.get("id") or ""),
        phone_number=str(row.get("phone_number") or ""),
        timezone_name=str(row.get("timezone_name") or "UTC"),
        display_name=row.get("full_name") or row.get("display_name"),
        organization_id=str(row.get("organization_id") or "1"),
        coach_id=str(row.get("coach_id") or ""),
    )

async def _get_ai_reply(request: Request, coach: dict[str, Any], athlete: AthleteRecord, text: str) -> str:
    checkin_service = getattr(request.app.state, "checkin_service", None)
    if checkin_service and hasattr(checkin_service, "handle_inbound_message"):
        reply = await checkin_service.handle_inbound_message(athlete=athlete, message_text=text)
        if isinstance(reply, str):
            return reply
    return f"Coach {coach.get('full_name')}, I received your message for athlete {athlete.display_name}: '{text}'. I'll process this with the AI."

@router.get("/whatsapp", response_class=PlainTextResponse)
async def whatsapp_webhook_handshake(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
) -> str:
    if hub_verify_token == get_settings().whatsapp_verify_token:
        return hub_challenge or ""
    raise HTTPException(status_code=403)

@router.post("/whatsapp", response_model=WhatsAppWebhookResponse)
async def whatsapp_webhook(request: Request) -> WhatsAppWebhookResponse:
    raw_body = await request.body()
    logger.info("[webhook] Received POST /whatsapp, body size=%d bytes", len(raw_body))

    settings = get_settings()
    if getattr(settings, "whatsapp_webhook_secret", None):
        try:
            verify_whatsapp_signature(request, raw_body)
        except HTTPException as exc:
            logger.error("[webhook] Signature verification failed: %s", exc.detail)
            raise
    else:
        logger.warning("[webhook] WHATSAPP_WEBHOOK_SECRET not set - skipping signature check")

    payload = await _read_payload(request)
    logger.info("[webhook] Payload keys: %s", list(payload.keys()))

    sender = None
    text = None
    if "entry" in payload:
        for entry in payload["entry"]:
            for change in entry.get("changes", []):
                val = change.get("value", {})
                if "messages" in val:
                    msg = val["messages"][0]
                    sender = msg.get("from")
                    text = msg.get("text", {}).get("body")
                    logger.info("[webhook] Extracted sender=%s text=%r", sender, text)
                    break
            if sender:
                break

    if not sender or not text:
        sender = payload.get("From") or payload.get("sender_phone_number")
        text = payload.get("Body") or payload.get("message_text")

    if not sender or not text:
        logger.warning("[webhook] Missing sender or text in payload: %s", payload)
        raise HTTPException(status_code=400, detail="Missing sender or text")

    supabase = request.app.state.supabase_client
    coach = await _find_coach_by_phone(supabase, sender)

    if not coach:
        logger.warning("[webhook] No coach matched for sender=%s - returning ignored", sender)
        return WhatsAppWebhookResponse(status="ignored", phone_number=sender, inbound_text=text)

    athlete = await _find_first_athlete(supabase, coach["id"])
    if not athlete:
        return WhatsAppWebhookResponse(status="no_athlete", matched_coach=True, coach_id=coach["id"])

    reply_body = await _get_ai_reply(request, coach, athlete, text)
    logger.info("[webhook] Sending reply to %s: %r", sender, reply_body)

    whatsapp = request.app.state.whatsapp_service
    recipient = WhatsAppRecipient(
        athlete_id=athlete.athlete_id,
        phone_number=sender,
        timezone_name=athlete.timezone_name,
        display_name=coach.get("full_name"),
    )
    res = await whatsapp.send_text_message(recipient, reply_body)
    logger.info("[webhook] send_text_message result: delivered=%s error=%s", res.delivered, res.error_message)

    return WhatsAppWebhookResponse(
        status="processed",
        matched_coach=True,
        coach_id=coach["id"],
        phone_number=sender,
        inbound_text=text,
        reply_sent=res.delivered,
        provider_message_id=res.provider_message_id,
        reply_body=res.body,
        delivery_error=res.error_message,
    )
