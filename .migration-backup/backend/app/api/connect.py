"""Athlete self-serve integration connections via short-lived token links (COA-35).

Public routes — no dashboard secret required. Authenticated by a single-use,
time-limited token generated during onboarding and sent to the athlete via WhatsApp.
"""
from __future__ import annotations

import inspect
import logging
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.config import get_settings

router = APIRouter(prefix="/connect", tags=["connect"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _query_rows(query: Any) -> list[dict[str, Any]]:
    """Execute a Supabase query and return rows (sync-safe)."""
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


def _error_html(message: str) -> str:
    return (
        "<!DOCTYPE html><html><head>"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<style>body{font-family:-apple-system,sans-serif;text-align:center;"
        "padding:60px 24px;color:#1a1a1a}"
        ".icon{font-size:48px;margin-bottom:16px}"
        ".title{font-size:22px;font-weight:600;margin-bottom:8px}"
        ".sub{color:#666;font-size:15px}</style></head><body>"
        '<div class="icon">\u274c</div>'
        f'<div class="title">{message}</div>'
        '<div class="sub">Ask your coach to resend the link if needed.</div>'
        "</body></html>"
    )


def _success_html() -> str:
    return (
        "<!DOCTYPE html><html><head>"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<style>body{font-family:-apple-system,sans-serif;text-align:center;"
        "padding:60px 24px;color:#1a1a1a}"
        ".icon{font-size:48px;margin-bottom:16px}"
        ".title{font-size:22px;font-weight:600;margin-bottom:8px}"
        ".sub{color:#666;font-size:15px}</style></head><body>"
        '<div class="icon">\u2705</div>'
        '<div class="title">Strava Connected!</div>'
        '<div class="sub">You can close this tab and return to WhatsApp.</div>'
        "</body></html>"
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/strava", response_class=HTMLResponse)
async def athlete_strava_connect(request: Request, token: str = Query(...)):
    """Validate the connect token and redirect to Strava OAuth."""
    supabase = request.app.state.supabase_client

    rows = await _query_rows(
        supabase.table("athlete_connect_tokens")
        .select("*")
        .eq("token", token)
        .is_("used_at", "null")
        .gte("expires_at", "now()")
    )
    if not rows:
        return HTMLResponse(
            _error_html("This link has expired or already been used."),
            status_code=410,
        )

    athlete_id = rows[0]["athlete_id"]
    settings = get_settings()

    if not settings.strava_client_id:
        return HTMLResponse(
            _error_html("Strava integration is not configured."),
            status_code=500,
        )

    base_url = "https://coach-ai-production-a5aa.up.railway.app"
    state = f"{athlete_id}:{token}"
    params = {
        "client_id": settings.strava_client_id,
        "redirect_uri": f"{base_url}/connect/strava/callback",
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "activity:read_all",
        "state": state,
    }
    return RedirectResponse(f"https://www.strava.com/oauth/authorize?{urlencode(params)}")


@router.get("/strava/callback", response_class=HTMLResponse)
async def athlete_strava_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
):
    """Handle Strava OAuth callback for athlete self-serve connect."""
    if error or not code:
        return HTMLResponse(
            _error_html("Strava authorization was cancelled. You can try again from the link in WhatsApp."),
        )

    if not state or ":" not in state:
        return HTMLResponse(_error_html("Invalid callback state."), status_code=400)

    athlete_id, token = state.split(":", 1)
    supabase = request.app.state.supabase_client

    # Re-validate token (still unused + not expired)
    rows = await _query_rows(
        supabase.table("athlete_connect_tokens")
        .select("*")
        .eq("token", token)
        .is_("used_at", "null")
        .gte("expires_at", "now()")
    )
    if not rows:
        return HTMLResponse(
            _error_html("This link has expired or already been used."),
            status_code=410,
        )

    # Exchange code for tokens
    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://www.strava.com/api/v3/oauth/token",
                data={
                    "client_id": settings.strava_client_id,
                    "client_secret": settings.strava_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("[connect] Strava token exchange failed: %s", exc)
        return HTMLResponse(
            _error_html("Failed to connect Strava. Please try again."),
            status_code=500,
        )

    strava_athlete_id = None
    if data.get("athlete"):
        strava_athlete_id = data["athlete"].get("id")

    # Upsert strava_tokens (same schema as coach flow)
    supabase.table("strava_tokens").upsert({
        "athlete_id": athlete_id,
        "strava_athlete_id": strava_athlete_id,
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at": data["expires_at"],
    }, on_conflict="athlete_id").execute()

    # Mark connect token as used
    supabase.table("athlete_connect_tokens").update({
        "used_at": "now()",
    }).eq("token", token).execute()

    logger.info("[connect] Strava connected for athlete %s via self-serve link", athlete_id)
    return HTMLResponse(_success_html())
