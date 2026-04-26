"""COA-93: Athlete authentication — invite generation, validation, and account linking.

Endpoints:
  POST  /api/v1/athlete/auth/send-invite              — coach sends invite (creates athlete + token in one call)
  POST  /api/v1/coach/athletes/{athlete_id}/invite    — coach re-invites an existing athlete by ID
  GET   /api/v1/athlete/auth/validate-invite          — public, validates token before signup
  POST  /api/v1/athlete/auth/link-account             — athlete JWT, links Supabase account to row
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.core.security import AuthenticatedPrincipal, require_roles, resolve_athlete_scope, resolve_coach_scope

logger = logging.getLogger(__name__)

router = APIRouter(tags=["athlete-auth"])


# ── Request / response models ─────────────────────────────────────────────────

class InviteAthleteResponse(BaseModel):
    invite_token: str
    invite_url: str
    athlete_id: str
    email: str
    expires_at: str
    whatsapp_sent: bool


class ValidateInviteResponse(BaseModel):
    valid: bool
    athlete_name: Optional[str] = None
    coach_name: Optional[str] = None
    email: Optional[str] = None
    expires_at: Optional[str] = None
    error: Optional[str] = None


class SendInviteRequest(BaseModel):
    full_name: str
    email: str
    phone_number: Optional[str] = None


class SendInviteResponse(BaseModel):
    message: str
    athlete_id: str
    invite_url: str


class LinkAccountResponse(BaseModel):
    linked: bool
    athlete_id: str
    coach_id: str


# ── Endpoint: coach sends a new invite (create athlete + token in one call) ───

@router.post(
    "/api/v1/athlete/auth/send-invite",
    response_model=SendInviteResponse,
    summary="Coach sends an athlete invite from the dashboard (COA-78 / COA-93)",
)
async def send_athlete_invite(
    body: SendInviteRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
):
    """Called by the InviteModal in the coach dashboard.

    If no athlete row with this email exists for this coach, one is created.
    If a row already exists (re-invite), a fresh token is generated.

    On success the athlete receives their invite URL via WhatsApp (if a phone
    number was provided). Email delivery can be added by wiring an SMTP/Resend
    provider to INVITE_EMAIL_FROM / RESEND_API_KEY env vars.
    """
    from datetime import timedelta
    from app.core.config import get_settings

    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)
    email = body.email.lower().strip()
    name = body.full_name.strip()
    phone = (body.phone_number or "").strip() or None

    if not email:
        raise HTTPException(status_code=422, detail="Email address is required")
    if not name:
        raise HTTPException(status_code=422, detail="Full name is required")

    # ── Find or create athlete row ─────────────────────────────────────────────
    athlete_id: str
    try:
        existing = supabase.table("athletes").select("id").eq(
            "email", email
        ).eq("coach_id", scope.coach_id).limit(1).execute()

        if existing.data:
            athlete_id = existing.data[0]["id"]
            logger.info("[send-invite] Re-inviting existing athlete %s", athlete_id[:8])
        else:
            insert_payload: dict = {
                "full_name": name,
                "email": email,
                "coach_id": scope.coach_id,
                "organization_id": scope.organization_id,
                "current_state": {},
            }
            if phone:
                insert_payload["phone_number"] = phone

            result = supabase.table("athletes").insert(insert_payload).execute()
            if not result.data:
                raise HTTPException(status_code=500, detail="Failed to create athlete record")
            athlete_id = result.data[0]["id"]
            logger.info("[send-invite] Created athlete row %s for coach %s", athlete_id[:8], scope.coach_id[:8])

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[send-invite] DB error finding/creating athlete for %s", email)
        raise HTTPException(status_code=500, detail="Database error") from exc

    # ── Invalidate old unused tokens ───────────────────────────────────────────
    try:
        supabase.table("athlete_invite_tokens").update(
            {"used_at": datetime.now(timezone.utc).isoformat()}
        ).eq("athlete_id", athlete_id).is_("used_at", "null").execute()
    except Exception:
        pass

    # ── Generate fresh invite token ────────────────────────────────────────────
    raw_token = secrets.token_hex(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    try:
        supabase.table("athlete_invite_tokens").insert({
            "token": raw_token,
            "coach_id": scope.coach_id,
            "athlete_id": athlete_id,
            "email": email,
            "expires_at": expires_at,
        }).execute()
    except Exception as exc:
        logger.exception("[send-invite] Failed to insert invite token for %s", email)
        raise HTTPException(status_code=500, detail="Could not create invite token") from exc

    settings = get_settings()
    invite_url = f"{settings.frontend_url.rstrip('/')}/athlete/join?token={raw_token}"

    # ── Load coach name ────────────────────────────────────────────────────────
    try:
        coach_row = supabase.table("coaches").select("full_name").eq(
            "id", scope.coach_id
        ).single().execute()
        coach_name = (coach_row.data or {}).get("full_name", "Your coach")
    except Exception:
        coach_name = "Your coach"

    # ── WhatsApp invite (if phone provided) ────────────────────────────────────
    whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
    if phone and not phone.startswith("web:") and whatsapp_client:
        try:
            message = (
                f"Hi {name} 👋\n\n"
                f"{coach_name} has invited you to join Andes.IA — your personal training platform.\n\n"
                f"Create your account here (link valid 7 days):\n{invite_url}\n\n"
                f"Once you sign up you'll see your training plan and can chat with your AI coach."
            )
            import asyncio
            asyncio.ensure_future(whatsapp_client.send_message(to=phone, body=message))
            logger.info("[send-invite] Queued WhatsApp invite to athlete %s", athlete_id[:8])
        except Exception:
            logger.warning("[send-invite] WhatsApp send failed for athlete %s", athlete_id[:8], exc_info=True)

    logger.info(
        "[send-invite] Invite sent for athlete %s by coach %s (url=%s…)",
        athlete_id[:8], scope.coach_id[:8], invite_url[:60],
    )

    return SendInviteResponse(
        message=f"Invite sent to {email}",
        athlete_id=athlete_id,
        invite_url=invite_url,
    )


# ── Endpoint: coach generates invite for a specific athlete ───────────────────

@router.post(
    "/api/v1/coach/athletes/{athlete_id}/invite",
    response_model=InviteAthleteResponse,
    summary="Generate a personalized invite link for an athlete (COA-93)",
)
async def generate_athlete_invite(
    athlete_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
):
    """Creates a single-use, 7-day invite token for an athlete and returns a
    signed invite URL. Optionally sends the link via WhatsApp if the athlete
    has a phone number on record.

    The athlete must already have an email address stored (set during onboarding
    or via the athlete row). If no email is set, the coach should update the
    athlete record first.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)

    # Load the athlete row — must belong to this coach
    try:
        row = supabase.table("athletes").select(
            "id, full_name, email, whatsapp_number, coach_id, organization_id, auth_user_id"
        ).eq("id", athlete_id).eq("coach_id", scope.coach_id).single().execute()
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Athlete not found") from exc

    if not row.data:
        raise HTTPException(status_code=404, detail="Athlete not found")

    athlete = row.data
    email = (athlete.get("email") or "").strip()
    if not email:
        raise HTTPException(
            status_code=422,
            detail="Athlete has no email address. Update the athlete record with an email before sending an invite.",
        )

    # Load coach name for the invite message
    try:
        coach_row = supabase.table("coaches").select("full_name, whatsapp_number").eq(
            "id", scope.coach_id
        ).single().execute()
        coach_name = coach_row.data.get("full_name", "Your coach") if coach_row.data else "Your coach"
        coach_phone = coach_row.data.get("whatsapp_number") if coach_row.data else None
    except Exception:
        coach_name = "Your coach"
        coach_phone = None

    # Invalidate any existing unused tokens for this athlete (keep it clean)
    try:
        supabase.table("athlete_invite_tokens").update(
            {"used_at": datetime.now(timezone.utc).isoformat()}
        ).eq("athlete_id", athlete_id).is_("used_at", "null").execute()
    except Exception:
        pass  # non-fatal

    # Generate a new token
    raw_token = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc).replace(
        microsecond=0
    )
    from datetime import timedelta
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    try:
        insert = supabase.table("athlete_invite_tokens").insert({
            "token": raw_token,
            "coach_id": scope.coach_id,
            "athlete_id": athlete_id,
            "email": email,
            "expires_at": expires_at,
        }).execute()
        if not insert.data:
            raise HTTPException(status_code=500, detail="Failed to create invite token")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[invite] Failed to insert invite token for athlete %s", athlete_id)
        raise HTTPException(status_code=500, detail="Could not create invite token") from exc

    # Build invite URL (frontend handles /athlete/join?token=...)
    from app.core.config import get_settings
    frontend_base = get_settings().frontend_url
    invite_url = f"{frontend_base.rstrip('/')}/athlete/join?token={raw_token}"

    # Optionally send WhatsApp
    whatsapp_sent = False
    athlete_phone = (athlete.get("whatsapp_number") or "").strip()
    if athlete_phone and not athlete_phone.startswith("web:"):
        whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
        if whatsapp_client:
            try:
                message = (
                    f"Hi {athlete.get('full_name', 'there')} 👋\n\n"
                    f"{coach_name} has invited you to join Andes.IA — your personal training platform.\n\n"
                    f"Create your account here (link valid 7 days):\n{invite_url}\n\n"
                    f"Once you sign up, you'll be able to view your training plan, upload files, and chat with your AI coach."
                )
                await whatsapp_client.send_message(to=athlete_phone, body=message)
                whatsapp_sent = True
                logger.info("[invite] Sent invite WhatsApp to athlete %s", athlete_id[:8])
            except Exception:
                logger.warning("[invite] Could not send WhatsApp invite for athlete %s", athlete_id[:8], exc_info=True)

    logger.info(
        "[invite] Created invite for athlete %s by coach %s (whatsapp_sent=%s)",
        athlete_id[:8], scope.coach_id[:8], whatsapp_sent,
    )

    return InviteAthleteResponse(
        invite_token=raw_token,
        invite_url=invite_url,
        athlete_id=athlete_id,
        email=email,
        expires_at=expires_at,
        whatsapp_sent=whatsapp_sent,
    )


# ── Endpoint: validate an invite token (no auth — called before signup) ───────

@router.get(
    "/api/v1/athlete/auth/validate-invite",
    response_model=ValidateInviteResponse,
    summary="Validate an athlete invite token (COA-93)",
)
async def validate_invite_token(
    request: Request,
    token: str = Query(..., description="The raw invite token from the URL"),
):
    """Public endpoint — no auth required. Called by the frontend /athlete/join
    page to pre-fill the signup form (name, email) and show a friendly coach name.

    Returns valid=False with an error reason if the token is expired, used, or unknown.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        row = supabase.table("athlete_invite_tokens").select(
            "id, token, athlete_id, coach_id, email, expires_at, used_at"
        ).eq("token", token).single().execute()
    except Exception:
        return ValidateInviteResponse(valid=False, error="Token not found")

    if not row.data:
        return ValidateInviteResponse(valid=False, error="Token not found")

    invite = row.data

    # Check used
    if invite.get("used_at"):
        return ValidateInviteResponse(valid=False, error="This invite link has already been used")

    # Check expiry
    expires_at_str = invite.get("expires_at", "")
    if expires_at_str:
        try:
            expires_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if expires_dt < datetime.now(timezone.utc):
                return ValidateInviteResponse(valid=False, error="This invite link has expired. Ask your coach to resend it.")
        except ValueError:
            pass

    # Load athlete name
    athlete_name: str | None = None
    try:
        athlete_row = supabase.table("athletes").select("full_name").eq(
            "id", invite["athlete_id"]
        ).single().execute()
        if athlete_row.data:
            athlete_name = athlete_row.data.get("full_name")
    except Exception:
        pass

    # Load coach name
    coach_name: str | None = None
    try:
        coach_row = supabase.table("coaches").select("full_name").eq(
            "id", invite["coach_id"]
        ).single().execute()
        if coach_row.data:
            coach_name = coach_row.data.get("full_name")
    except Exception:
        pass

    return ValidateInviteResponse(
        valid=True,
        athlete_name=athlete_name,
        coach_name=coach_name,
        email=invite.get("email"),
        expires_at=expires_at_str,
    )


# ── Endpoint: link Supabase Auth account to athlete row (called after signup) ─

@router.post(
    "/api/v1/athlete/auth/link-account",
    response_model=LinkAccountResponse,
    summary="Link an athlete's new Supabase account to their athlete row (COA-93)",
)
async def link_athlete_account(
    request: Request,
    token: str = Query(..., description="The invite token — proves the athlete used the right link"),
    principal: AuthenticatedPrincipal = Depends(require_roles("authenticated")),
):
    """Called immediately after the athlete signs up and confirms their email.

    The frontend passes the invite token from localStorage alongside the athlete's
    Bearer JWT. This endpoint:
    1. Validates the invite token (not used, not expired, email matches JWT email)
    2. Updates the athlete row: set auth_user_id = principal.user_id
    3. Marks the invite token as used
    4. Returns athlete_id and coach_id so the frontend can redirect correctly

    After this call, the athlete's next login will produce a JWT with
    athlete_id, coach_id, and role="athlete" (via the custom access token hook).
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    # Load invite token
    try:
        invite_row = supabase.table("athlete_invite_tokens").select(
            "id, athlete_id, coach_id, email, expires_at, used_at"
        ).eq("token", token).single().execute()
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Invite token not found") from exc

    if not invite_row.data:
        raise HTTPException(status_code=404, detail="Invite token not found")

    invite = invite_row.data

    if invite.get("used_at"):
        raise HTTPException(status_code=409, detail="This invite link has already been used")

    # Check expiry
    expires_at_str = invite.get("expires_at", "")
    if expires_at_str:
        try:
            expires_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if expires_dt < datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=410,
                    detail="This invite link has expired. Ask your coach to resend it.",
                )
        except HTTPException:
            raise
        except ValueError:
            pass

    # Verify email match (principal.email comes from the Supabase JWT)
    if principal.email and invite.get("email"):
        if principal.email.lower().strip() != invite["email"].lower().strip():
            raise HTTPException(
                status_code=403,
                detail="The email address used to sign up does not match the invite. "
                       "Please sign up with the email address your coach used to invite you.",
            )

    athlete_id = invite["athlete_id"]
    coach_id = invite["coach_id"]

    # Check the athlete row doesn't already have a different auth_user_id
    try:
        athlete_row = supabase.table("athletes").select(
            "id, auth_user_id, full_name"
        ).eq("id", athlete_id).single().execute()
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Athlete record not found") from exc

    if not athlete_row.data:
        raise HTTPException(status_code=404, detail="Athlete record not found")

    existing_auth_id = athlete_row.data.get("auth_user_id")
    if existing_auth_id and existing_auth_id != principal.user_id:
        raise HTTPException(
            status_code=409,
            detail="This athlete account is already linked to a different Supabase user.",
        )

    # Link the auth account
    try:
        supabase.table("athletes").update({
            "auth_user_id": principal.user_id,
            "email": invite["email"],
        }).eq("id", athlete_id).execute()
    except Exception as exc:
        logger.exception("[link-account] Failed to update athlete row %s", athlete_id)
        raise HTTPException(status_code=500, detail="Could not link account") from exc

    # Mark invite token as used
    try:
        supabase.table("athlete_invite_tokens").update({
            "used_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", invite["id"]).execute()
    except Exception:
        logger.warning("[link-account] Could not mark invite token %s as used", invite["id"])

    logger.info(
        "[link-account] Linked auth_user %s to athlete %s (coach %s)",
        principal.user_id[:8], athlete_id[:8], str(coach_id)[:8],
    )

    return LinkAccountResponse(
        linked=True,
        athlete_id=athlete_id,
        coach_id=str(coach_id),
    )
