"""Webhook routes for athlete check-in flow."""
from __future__ import annotations
import asyncio
import inspect
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs
import httpx
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
    coach_id: str
    phone_number: str
    timezone_name: str
    display_name: str | None = None


class WhatsAppWebhookResponse(BaseModel):
    status: str
    athlete_id: str | None = None
    coach_id: str | None = None
    message_id: str | None = None


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
        rows = await _query_rows(supabase_client.table("athletes").select("*").eq("phone_number", value))
        if rows:
            row = rows[0]
            logger.info("[webhook] Found athlete: id=%s coach_id=%s", row.get("id"), row.get("coach_id"))
            return AthleteRecord(
                athlete_id=str(row.get("id") or ""),
                coach_id=str(row.get("coach_id") or ""),
                phone_number=str(row.get("phone_number") or ""),
                timezone_name=str(row.get("timezone_name") or "UTC"),
                display_name=row.get("full_name") or row.get("display_name"),
            )
    return None


async def _generate_suggestion(supabase: Any, athlete: AthleteRecord, text: str) -> str:
    settings = get_settings()
    groq_api_key = getattr(settings, "groq_api_key", None)
    if not groq_api_key:
        return "Coach, the athlete shared an update. Please review their check-in."
    system_prompt = (
        "You are an AI assistant helping a professional sports coach. "
        f"Analyze the following check-in from athlete {athlete.display_name}. "
        "Draft a supportive, professional reply FROM the coach to the athlete. "
        "Keep it under 3 sentences."
    )
    user_prompt = f"Athlete check-in: '{text}'"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.1-70b-versatile",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except Exception as exc:
        logger.error("[webhook] AI suggestion failed: %s", exc)
        return "Coach, please review the new athlete check-in."


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
    logger.info("[webhook] Received athlete POST /whatsapp, body size=%d bytes", len(raw_body))
    settings = get_settings()
    if getattr(settings, "whatsapp_webhook_secret", None):
        try:
            verify_whatsapp_signature(request, raw_body)
        except HTTPException as exc:
            logger.error("[webhook] Signature verification failed: %s", exc.detail)
            raise

    payload = await _read_payload(request)
    sender = None
    text = None
    wa_msg_id = None

    if "entry" in payload:
        for entry in payload["entry"]:
            for change in entry.get("changes", []):
                val = change.get("value", {})
                if "messages" in val:
                    msg = val["messages"][0]
                    sender = msg.get("from")
                    wa_msg_id = msg.get("id")
                    if msg.get("type") == "text":
                        text = msg.get("text", {}).get("body")
                    elif msg.get("type") in ("audio", "voice"):
                        text = "[Audio Message]"
                    break

    if not sender or not text:
        logger.info("[webhook] No message content found in payload")
        return WhatsAppWebhookResponse(status="ignored")

    supabase = request.app.state.supabase_client
    athlete = await _find_athlete_by_phone(supabase, sender)

    if not athlete:
        logger.warning("[webhook] Sender %s not recognized as athlete", sender)
        return WhatsAppWebhookResponse(status="ignored")

    checkin_payload = {
        "athlete_id": athlete.athlete_id,
        "coach_id": athlete.coach_id,
        "phone_number": sender,
        "message_text": text,
        "whatsapp_message_id": wa_msg_id,
        "message_type": "text" if text != "[Audio Message]" else "voice",
    }
    checkin_res = await supabase.table("athlete_checkins").insert(checkin_payload).execute()
    checkin_id = checkin_res.data[0].get("id") if checkin_res.data else None

    suggestion_text = await _generate_suggestion(supabase, athlete, text)

    suggestion_payload = {
        "athlete_id": athlete.athlete_id,
        "athlete_display_name": athlete.display_name,
        "athlete_phone_number": sender,
        "suggestion": {"reply": suggestion_text},
        "suggestion_text": suggestion_text,
        "status": "pending",
        "source": "whatsapp_checkin",
    }
    suggestion_res = await supabase.table("suggestions").insert(suggestion_payload).execute()
    suggestion_id = suggestion_res.data[0].get("id") if suggestion_res.data else None

    if checkin_id and suggestion_id:
        await supabase.table("athlete_checkins").update({
            "suggestion_id": suggestion_id,
            "processed": True,
            "processed_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", checkin_id).execute()

    logger.info("[webhook] Athlete check-in processed: id=%s suggestion_id=%s", checkin_id, suggestion_id)

    return WhatsAppWebhookResponse(
        status="processed",
        athlete_id=athlete.athlete_id,
        coach_id=athlete.coach_id,
        message_id=wa_msg_id
    )
