"""COA-121: Coach-initiated WhatsApp messaging.

Endpoints (coach-facing):
  POST /api/v1/coach/athletes/{athlete_id}/message
      Send a WhatsApp message to an athlete directly.
      Optionally run the message through AI to polish tone/clarity.
      Logs the event to athlete_memory_events for full audit trail.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.security import (
    AuthenticatedPrincipal,
    require_roles,
    resolve_coach_scope,
)
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["coach-messaging"])


# ── Models ────────────────────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    message: str
    ai_polish: bool = False          # run through LLM before sending


class SendMessageResponse(BaseModel):
    sent: bool
    message: str                     # final text sent (may differ if ai_polish=True)
    athlete_name: str
    athlete_phone: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _polish_message(raw: str, athlete_name: str, coach_name: str) -> str:
    """Run the coach's message through the LLM for tone/clarity polish."""
    try:
        from app.services.llm_client import LLMClient
        llm = LLMClient()
        prompt = (
            f"You are assisting coach {coach_name}. "
            f"Rewrite the following message to athlete {athlete_name} to be clear, "
            f"warm, and professional. Keep the coach's intent exactly. "
            f"Return ONLY the rewritten message with no preamble or quotes.\n\n"
            f"Original: {raw}"
        )
        result = await run_in_threadpool(llm.complete, prompt)
        polished = (result or "").strip()
        return polished if polished else raw
    except Exception as exc:
        logger.warning("[coach_messaging] AI polish failed, using raw: %s", exc)
        return raw


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/api/v1/coach/athletes/{athlete_id}/message",
    response_model=SendMessageResponse,
)
async def send_message_to_athlete(
    athlete_id: str,
    body: SendMessageRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
) -> SendMessageResponse:
    """Send a WhatsApp message to an athlete, optionally AI-polished.

    The message is logged to athlete_memory_events for visibility on the
    athlete detail page and audit trail.
    """
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    supabase = get_supabase_client()
    scope = resolve_coach_scope(principal)

    # ── Fetch athlete (verify ownership) ─────────────────────────────────────
    def _fetch_athlete():
        return (
            supabase.table("athletes")
            .select("id, full_name, phone_number, coach_id")
            .eq("id", athlete_id)
            .eq("coach_id", scope.coach_id)
            .single()
            .execute()
        )

    try:
        res = await run_in_threadpool(_fetch_athlete)
    except Exception as exc:
        logger.exception("[coach_messaging] DB fetch failed for athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to fetch athlete") from exc

    if not res.data:
        raise HTTPException(status_code=404, detail="Athlete not found or not in your roster")

    athlete = res.data
    athlete_name = athlete.get("full_name") or "Athlete"
    athlete_phone = athlete.get("phone_number") or ""

    if not athlete_phone:
        raise HTTPException(
            status_code=400,
            detail=f"{athlete_name} has no phone number on file — add it first",
        )

    # ── Optionally polish via AI ──────────────────────────────────────────────
    raw_message = body.message.strip()
    coach_name = principal.email or "Coach"

    if body.ai_polish:
        final_message = await _polish_message(raw_message, athlete_name, coach_name)
        logger.info(
            "[coach_messaging] AI polished message for athlete=%s (was %d chars, now %d)",
            athlete_id[:8], len(raw_message), len(final_message),
        )
    else:
        final_message = raw_message

    # ── Send via WhatsApp ─────────────────────────────────────────────────────
    whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
    if not whatsapp_client:
        logger.error("[coach_messaging] WhatsApp client not initialised — cannot send")
        raise HTTPException(
            status_code=503,
            detail="WhatsApp is not configured on this server",
        )

    try:
        await whatsapp_client.send_message(athlete_phone, final_message)
        logger.info(
            "[coach_messaging] Sent to athlete=%s phone=%s…",
            athlete_id[:8], athlete_phone[:6],
        )
    except Exception as exc:
        logger.exception("[coach_messaging] WhatsApp send failed for athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=502, detail="WhatsApp delivery failed") from exc

    # ── Log to memory feed ────────────────────────────────────────────────────
    def _log_memory():
        return (
            supabase.table("athlete_memory_events")
            .insert({
                "athlete_id": athlete_id,
                "event_type": "whatsapp_coach",
                "content": final_message[:500],
                "metadata": {
                    "coach_initiated": True,
                    "ai_polished": body.ai_polish,
                    "raw_message": raw_message[:200] if body.ai_polish else None,
                },
            })
            .execute()
        )

    try:
        await run_in_threadpool(_log_memory)
    except Exception as exc:
        logger.warning("[coach_messaging] Memory log failed (non-fatal): %s", exc)

    return SendMessageResponse(
        sent=True,
        message=final_message,
        athlete_name=athlete_name,
        athlete_phone=athlete_phone,
    )
