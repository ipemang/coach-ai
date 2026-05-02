from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import get_settings

router = APIRouter(prefix="/api/v1/invites", tags=["invites"])

DEFAULT_INVITE_TTL_DAYS = 30


class InviteCreateRequest(BaseModel):
    coach_id: str = Field(..., min_length=1, description="Supabase coach_id for the coach record")
    organization_id: str = Field(..., min_length=1, description="Organization scope for the coach record")
    expires_in_days: int = Field(default=DEFAULT_INVITE_TTL_DAYS, ge=1, le=365)


class InviteCreateResponse(BaseModel):
    invite_id: str
    coach_id: str
    organization_id: str
    invite_token: str
    invite_url: str
    expires_at: str


class InviteResolveRequest(BaseModel):
    invite_token: str = Field(..., min_length=1)
    athlete_id: str = Field(..., min_length=1, description="Athlete identifier to attach to the coach roster")
    athlete_name: str | None = None


class InviteResolveResponse(BaseModel):
    invite_id: str
    coach_id: str
    organization_id: str
    athlete_id: str
    athlete_name: str | None = None
    roster_updated: bool
    coach_record: dict[str, Any] = Field(default_factory=dict)
    athlete_record: dict[str, Any] = Field(default_factory=dict)


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


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _get_invite_secret() -> str:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Supabase service role key is not configured")
    return settings.supabase_service_role_key


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _sign_payload(payload: dict[str, Any]) -> str:
    payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    payload_segment = _base64url_encode(payload_json)
    signature = hmac.new(_get_invite_secret().encode("utf-8"), payload_segment.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_segment}.{_base64url_encode(signature)}"


def _verify_token(token: str) -> dict[str, Any]:
    try:
        payload_segment, signature_segment = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid invite token") from exc

    expected_signature = hmac.new(
        _get_invite_secret().encode("utf-8"),
        payload_segment.encode("ascii"),
        hashlib.sha256,
    ).digest()
    try:
        received_signature = _base64url_decode(signature_segment)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid invite token") from exc

    if not hmac.compare_digest(expected_signature, received_signature):
        raise HTTPException(status_code=400, detail="Invalid invite token")

    try:
        payload = json.loads(_base64url_decode(payload_segment).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid invite token") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid invite token")

    expires_at = _string_value(payload.get("expires_at"))
    if expires_at is not None:
        try:
            parsed = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid invite token") from exc
        if parsed < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Invite token has expired")

    return payload


async def _find_coach_record(supabase_client: Any, coach_id: str, organization_id: str) -> dict[str, Any] | None:
    table = supabase_client.table("coaches")
    query = table.select("*") if hasattr(table, "select") else table
    if hasattr(query, "eq"):
        query = query.eq("coach_id", coach_id)
        query = query.eq("organization_id", organization_id)
    rows = await _query_rows(query)
    if rows:
        return rows[0]

    if hasattr(table, "select") and hasattr(table, "eq"):
        fallback_query = table.select("*").eq("id", coach_id)
        fallback_rows = await _query_rows(fallback_query)
        for row in fallback_rows:
            if _string_value(row.get("organization_id")) == organization_id:
                return row

    return None


async def _find_athlete_record(supabase_client: Any, athlete_id: str) -> dict[str, Any] | None:
    table = supabase_client.table("athletes")

    if hasattr(table, "select") and hasattr(table, "eq"):
        for column in ("id", "athlete_id"):
            rows = await _query_rows(table.select("*").eq(column, athlete_id))
            if rows:
                return rows[0]

    rows = await _query_rows(table.select("*") if hasattr(table, "select") else table)
    for row in rows:
        row_athlete_id = _string_value(row.get("id") or row.get("athlete_id") or row.get("athleteId"))
        if row_athlete_id == athlete_id:
            return row

    return None


async def _update_athlete_roster_membership(supabase_client: Any, athlete_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    table = supabase_client.table("athletes")
    if hasattr(table, "update") and hasattr(table, "eq"):
        updater = table.update(payload).eq("id", athlete_id)
        if hasattr(updater, "execute"):
            response = await updater.execute()
        else:
            response = await updater
        rows = _extract_rows(response)
        if rows:
            return rows[0]

        if "athlete_id" in payload:
            updater = table.update(payload).eq("athlete_id", athlete_id)
            if hasattr(updater, "execute"):
                response = await updater.execute()
            else:
                response = await updater
            rows = _extract_rows(response)
            if rows:
                return rows[0]

    if hasattr(table, "upsert"):
        response = await table.upsert({"id": athlete_id, **payload})
        rows = _extract_rows(response)
        if rows:
            return rows[0]
        return {"id": athlete_id, **payload}

    raise RuntimeError("Supabase table does not support update operations")


@router.post("", response_model=InviteCreateResponse)
async def create_invite(request: Request, payload: InviteCreateRequest) -> InviteCreateResponse:
    supabase_client = await _resolve_supabase_client(request)
    coach_record = await _find_coach_record(supabase_client, payload.coach_id, payload.organization_id)
    if coach_record is None:
        raise HTTPException(status_code=404, detail=f"Coach {payload.coach_id} was not found")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=payload.expires_in_days)
    invite_id = str(uuid4())
    token_payload = {
        "invite_id": invite_id,
        "coach_id": payload.coach_id,
        "organization_id": payload.organization_id,
        "issued_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "nonce": secrets.token_urlsafe(16),
    }
    invite_token = _sign_payload(token_payload)
    invite_url = str(request.url_for("resolve_invite")) + f"?token={invite_token}"

    return InviteCreateResponse(
        invite_id=invite_id,
        coach_id=payload.coach_id,
        organization_id=payload.organization_id,
        invite_token=invite_token,
        invite_url=invite_url,
        expires_at=expires_at.isoformat(),
    )


@router.post("/resolve", name="resolve_invite", response_model=InviteResolveResponse)
async def resolve_invite(request: Request, payload: InviteResolveRequest) -> InviteResolveResponse:
    supabase_client = await _resolve_supabase_client(request)
    token_payload = _verify_token(payload.invite_token)

    coach_id = _string_value(token_payload.get("coach_id"))
    organization_id = _string_value(token_payload.get("organization_id"))
    invite_id = _string_value(token_payload.get("invite_id"))
    if coach_id is None or organization_id is None or invite_id is None:
        raise HTTPException(status_code=400, detail="Invalid invite token")

    coach_record = await _find_coach_record(supabase_client, coach_id, organization_id)
    if coach_record is None:
        raise HTTPException(status_code=404, detail=f"Coach {coach_id} was not found")

    athlete_record = await _find_athlete_record(supabase_client, payload.athlete_id)
    if athlete_record is None:
        raise HTTPException(status_code=404, detail=f"Athlete {payload.athlete_id} was not found")

    existing_coach_id = _string_value(athlete_record.get("coach_id"))
    existing_organization_id = _string_value(athlete_record.get("organization_id"))
    update_payload: dict[str, Any] = {
        "coach_id": coach_id,
        "organization_id": organization_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.athlete_name is not None:
        update_payload.setdefault("athlete_name", payload.athlete_name)
        update_payload.setdefault("display_name", payload.athlete_name)

    if existing_coach_id == coach_id and existing_organization_id == organization_id:
        roster_updated = False
        updated_athlete_record = athlete_record
    else:
        updated_athlete_record = await _update_athlete_roster_membership(supabase_client, payload.athlete_id, update_payload)
        roster_updated = True

    return InviteResolveResponse(
        invite_id=invite_id,
        coach_id=coach_id,
        organization_id=organization_id,
        athlete_id=payload.athlete_id,
        athlete_name=payload.athlete_name,
        roster_updated=roster_updated,
        coach_record=coach_record,
        athlete_record=updated_athlete_record,
    )
