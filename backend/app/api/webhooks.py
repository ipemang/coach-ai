"""Webhook routes for external messaging providers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services.whatsapp_service import WhatsAppRecipient, WhatsAppService

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


@dataclass(slots=True)
class AthleteRecord:
    athlete_id: str
    phone_number: str
    timezone_name: str
    display_name: str | None = None


class WhatsAppWebhookResponse(BaseModel):
    status: str
    matched_athlete: bool = False
    athlete_id: str | None = None
    phone_number: str | None = None
    inbound_text: str | None = None
    reply_sent: bool = False
    provider_message_id: str | None = None
    reply_body: str | None = None


class WhatsAppWebhookPayload(BaseModel):
    sender_phone_number: str | None = Field(default=None)
    message_text: str | None = Field(default=None)


async def _read_payload(request: Request) -> dict[str, Any]:
    content_type = (request.headers.get("content-type") or "").lower()
    raw_body = await request.body()
    if not raw_body:
        return {}

    if "application/json" in content_type or raw_body.lstrip().startswith((b"{", b"[")):
        try:
            decoded = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
        return decoded if isinstance(decoded, dict) else {"data": decoded}

    parsed = parse_qs(raw_body.decode("utf-8"), keep_blank_values=True)
    flattened: dict[str, Any] = {}
    for key, values in parsed.items():
        if not values:
            continue
        flattened[key] = values[0] if len(values) == 1 else values
    return flattened


def _phone_variants(phone_number: str) -> list[str]:
    normalized = _normalize_phone_number(phone_number)
    variants: list[str] = []
    for value in (phone_number.strip(), normalized, normalized.lstrip("+")):
        if value and value not in variants:
            variants.append(value)
    return variants


def _normalize_phone_number(phone_number: str) -> str:
    digits = "".join(ch for ch in phone_number if ch.isdigit())
    if phone_number.strip().startswith("+"):
        return f"+{digits}"
    return digits


def _extract_sender_phone(payload: dict[str, Any]) -> str | None:
    for key in ("From", "from", "sender_phone_number", "phone_number", "wa_id", "WaId"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    entry = payload.get("entry")
    if isinstance(entry, list):
        for entry_item in entry:
            if not isinstance(entry_item, dict):
                continue
            changes = entry_item.get("changes")
            if not isinstance(changes, list):
                continue
            for change in changes:
                if not isinstance(change, dict):
                    continue
                value = change.get("value")
                if not isinstance(value, dict):
                    continue
                contacts = value.get("contacts")
                if isinstance(contacts, list) and contacts:
                    contact = contacts[0]
                    if isinstance(contact, dict):
                        phone = contact.get("wa_id") or contact.get("phone_number")
                        if isinstance(phone, str) and phone.strip():
                            return phone.strip()
                messages = value.get("messages")
                if isinstance(messages, list) and messages:
                    message = messages[0]
                    if isinstance(message, dict):
                        phone = message.get("from") or message.get("wa_id")
                        if isinstance(phone, str) and phone.strip():
                            return phone.strip()
    return None


def _extract_message_text(payload: dict[str, Any]) -> str | None:
    for key in ("Body", "body", "message_text", "text"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            body = value.get("body") or value.get("text")
            if isinstance(body, str) and body.strip():
                return body.strip()

    entry = payload.get("entry")
    if isinstance(entry, list):
        for entry_item in entry:
            if not isinstance(entry_item, dict):
                continue
            changes = entry_item.get("changes")
            if not isinstance(changes, list):
                continue
            for change in changes:
                if not isinstance(change, dict):
                    continue
                value = change.get("value")
                if not isinstance(value, dict):
                    continue
                messages = value.get("messages")
                if not isinstance(messages, list):
                    continue
                for message in messages:
                    if not isinstance(message, dict):
                        continue
                    text = message.get("text")
                    if isinstance(text, dict):
                        body = text.get("body")
                        if isinstance(body, str) and body.strip():
                            return body.strip()
                    body = message.get("body")
                    if isinstance(body, str) and body.strip():
                        return body.strip()
    return None


async def _query_rows(query: Any) -> list[dict[str, Any]]:
    if hasattr(query, "execute"):
        response = await query.execute()
    elif hasattr(query, "__await__"):
        response = await query
    else:
        response = query
    return _extract_rows(response)


def _extract_rows(response: Any) -> list[dict[str, Any]]:
    if response is None:
        return []
    if isinstance(response, list):
        return [row for row in response if isinstance(row, dict)]
    if isinstance(response, dict):
        data = response.get("data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        if isinstance(data, dict):
            return [data]
        if any(isinstance(value, (str, int, float, bool)) or value is None for value in response.values()):
            return [response]
        return []
    if hasattr(response, "data"):
        data = getattr(response, "data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        if isinstance(data, dict):
            return [data]
    return []


async def _find_athlete_by_phone(supabase_client: Any, phone_number: str) -> AthleteRecord | None:
    normalized_phone = _normalize_phone_number(phone_number)
    variants = _phone_variants(phone_number)
    table = await supabase_client.table("athletes")

    search_fields = ("phone_number", "whatsapp_number", "phone")
    for field in search_fields:
        for value in variants:
            query = table.select("*") if hasattr(table, "select") else table
            if hasattr(query, "eq"):
                query = query.eq(field, value)
            rows = await _query_rows(query)
            if rows:
                row = _match_row(rows, normalized_phone)
                if row is not None:
                    return row

    if hasattr(table, "select"):
        rows = await _query_rows(table.select("*"))
        row = _match_row(rows, normalized_phone)
        if row is not None:
            return row

    return None


def _match_row(rows: list[dict[str, Any]], normalized_phone: str) -> AthleteRecord | None:
    for row in rows:
        for key in ("phone_number", "whatsapp_number", "phone"):
            value = row.get(key)
            if isinstance(value, str) and _normalize_phone_number(value) == normalized_phone:
                return AthleteRecord(
                    athlete_id=str(row.get("id") or row.get("athlete_id") or ""),
                    phone_number=value,
                    timezone_name=str(row.get("timezone_name") or row.get("timezone") or "UTC"),
                    display_name=row.get("display_name") or row.get("name"),
                )
    if rows:
        row = rows[0]
        phone_number = str(row.get("phone_number") or row.get("whatsapp_number") or row.get("phone") or "")
        return AthleteRecord(
            athlete_id=str(row.get("id") or row.get("athlete_id") or ""),
            phone_number=phone_number,
            timezone_name=str(row.get("timezone_name") or row.get("timezone") or "UTC"),
            display_name=row.get("display_name") or row.get("name"),
        )
    return None


async def _route_to_checkin_logic(request: Request, athlete: AthleteRecord, message_text: str) -> str:
    checkin_service = getattr(request.app.state, "checkin_service", None)
    if checkin_service is None:
        checkin_service = getattr(request.app.state, "checkin_handler", None)

    if checkin_service is not None:
        for method_name in (
            "handle_inbound_message",
            "process_inbound_message",
            "route_text",
            "reply_to_text",
            "handle_message",
        ):
            method = getattr(checkin_service, method_name, None)
            if not callable(method):
                continue

            try:
                result = method(athlete=athlete, message_text=message_text)
            except TypeError:
                try:
                    result = method(message_text)
                except TypeError:
                    result = method(athlete, message_text)

            if hasattr(result, "__await__"):
                result = await result
            if isinstance(result, str) and result.strip():
                return result.strip()
            if isinstance(result, dict):
                for key in ("reply_body", "body", "message", "text"):
                    value = result.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()

    greeting = athlete.display_name or "there"
    return (
        f"Hi {greeting}, Aria got your check-in message: {message_text}. "
        "I’ll make sure it’s recorded."
    )


async def _resolve_supabase_client(request: Request) -> Any:
    supabase_client = getattr(request.app.state, "supabase_client", None)
    if supabase_client is not None:
        return supabase_client

    whatsapp_service = getattr(request.app.state, "whatsapp_service", None)
    if whatsapp_service is not None:
        candidate = getattr(whatsapp_service, "supabase_client", None)
        if candidate is not None:
            return candidate

    raise HTTPException(status_code=503, detail="Supabase client is not configured")


async def _resolve_whatsapp_service(request: Request) -> Any:
    service = getattr(request.app.state, "whatsapp_service", None)
    if service is not None and hasattr(service, "send_text_message"):
        return service

    whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
    if whatsapp_client is None:
        raise HTTPException(status_code=503, detail="WhatsApp service is not configured")

    return WhatsAppService(whatsapp_client=whatsapp_client, supabase_client=getattr(request.app.state, "supabase_client", None))


@router.post("/whatsapp", response_model=WhatsAppWebhookResponse)
async def whatsapp_webhook(request: Request) -> WhatsAppWebhookResponse:
    payload = await _read_payload(request)
    inbound = WhatsAppWebhookPayload(
        sender_phone_number=_extract_sender_phone(payload),
        message_text=_extract_message_text(payload),
    )

    if not inbound.sender_phone_number:
        raise HTTPException(status_code=400, detail="Unable to extract sender phone number")
    if not inbound.message_text:
        raise HTTPException(status_code=400, detail="Unable to extract message text")

    supabase_client = await _resolve_supabase_client(request)
    athlete = await _find_athlete_by_phone(supabase_client, inbound.sender_phone_number)
    if athlete is None:
        return WhatsAppWebhookResponse(
            status="ignored",
            matched_athlete=False,
            phone_number=inbound.sender_phone_number,
            inbound_text=inbound.message_text,
        )

    reply_body = await _route_to_checkin_logic(request, athlete, inbound.message_text)
    whatsapp_service = await _resolve_whatsapp_service(request)
    recipient = WhatsAppRecipient(
        athlete_id=athlete.athlete_id,
        phone_number=athlete.phone_number,
        timezone_name=athlete.timezone_name,
        display_name=athlete.display_name,
    )

    try:
        send_result = await whatsapp_service.send_text_message(
            recipient,
            reply_body,
            source="whatsapp_webhook",
            inbound_text=inbound.message_text,
            sent_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:  # pragma: no cover - downstream transport failure
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return WhatsAppWebhookResponse(
        status="processed",
        matched_athlete=True,
        athlete_id=athlete.athlete_id,
        phone_number=athlete.phone_number,
        inbound_text=inbound.message_text,
        reply_sent=True,
        provider_message_id=send_result.provider_message_id,
        reply_body=send_result.body,
    )
