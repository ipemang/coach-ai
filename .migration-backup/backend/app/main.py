"""Andes.IA backend application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from uuid import uuid4
from typing import Any, AsyncIterator, Optional

import httpx
from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from supabase import create_client

from .api.coach import router as coach_router
from .api.methodology import router as methodology_router
from .api.v1.router import router as v1_router
from .api.webhooks import router as webhooks_router
from .api.connect import router as connect_router
from .api.onboard import router as onboard_router
from .api.athlete_portal import router as athlete_portal_router
# dashboard_router, workouts_dashboard_router, workouts_plan_router removed —
# the old secret-gated HTML dashboard is decommissioned. Next.js frontend is
# canonical. Remove DASHBOARD_SECRET from Railway env vars.
from .services import DataScope, get_settings
from .services.whatsapp_service import WhatsAppService

logger = logging.getLogger(__name__)


class WhatsAppGraphClient:
    def __init__(
        self,
        access_token: Optional[str],
        phone_number_id: Optional[str],
    ) -> None:
        self.access_token = access_token
        self.phone_number_id = phone_number_id
        self.graph_api_version = "v19.0"

    @staticmethod
    def _normalize_e164(phone: str) -> str:
        """Normalize a phone number to E.164 format required by Meta Graph API.

        Meta requires numbers like +12025551234 — with the leading '+' and
        country code. Numbers stored without '+' (e.g. '12025551234') or
        without country code (e.g. '2025551234') cause messages to sit as
        'pending' and never deliver.
        """
        digits = "".join(ch for ch in phone if ch.isdigit())
        if not digits:
            return phone  # can't normalize — return as-is and let Meta error
        if len(digits) == 10:
            # Assume US/Canada
            digits = f"1{digits}"
        # Always prefix with +
        return f"+{digits}"

    async def send_message(self, to: str, body: str, **kwargs: Any) -> dict[str, Any]:
        if not self.access_token or not self.phone_number_id:
            raise RuntimeError("WhatsApp client is not configured")

        # Normalize to E.164 — Meta requires '+COUNTRYCODE...' format
        to_normalized = self._normalize_e164(to)
        if to_normalized != to:
            logger.info("[whatsapp] Normalized phone %r → %r", to[:4] + "***", to_normalized[:4] + "***")

        url = f"https://graph.facebook.com/{self.graph_api_version}/{self.phone_number_id}/messages"
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to_normalized,
            "type": "text",
            "text": {"body": body},
        }
        payload.update(kwargs)

        logger.info("[whatsapp] Sending message to %s via %s", to_normalized[:4] + "***", url)
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json",
                    },
                )
            logger.info("[whatsapp] Graph API response: status=%d", response.status_code)
            if response.status_code >= 400:
                error_text = response.text
                logger.error("[whatsapp] Graph API error: %s", error_text)
                try:
                    error_payload = response.json()
                    error = error_payload.get("error", {})
                    detail = str(
                        error.get("message")
                        or error.get("error_user_msg")
                        or error_text
                        or "WhatsApp send failed"
                    )
                except Exception:
                    detail = error_text or "WhatsApp send failed"
                raise RuntimeError(detail)
            raw = response.text
            return response.json() if raw else {}
        except httpx.TimeoutException as exc:
            logger.error("[whatsapp] Request timed out: %s", exc)
            raise RuntimeError("WhatsApp send failed: timeout") from exc
        except httpx.RequestError as exc:
            logger.error("[whatsapp] Request error: %s", exc)
            raise RuntimeError("WhatsApp send failed") from exc


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    scope = DataScope(organization_id=settings.organization_id, coach_id=settings.coach_id)
    app.state.scope = scope
    app.state.organization_id = settings.organization_id
    app.state.coach_id = settings.coach_id

    supabase_client = None
    if settings.supabase_url and settings.supabase_service_role_key:
        supabase_client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    app.state.supabase_client = supabase_client

    # Only initialize WhatsApp if credentials are present — app must start without them
    whatsapp_client = None
    whatsapp_service = None
    if settings.whatsapp_access_token and settings.whatsapp_phone_number_id:
        whatsapp_client = WhatsAppGraphClient(
            settings.whatsapp_access_token, settings.whatsapp_phone_number_id
        )
        whatsapp_service = WhatsAppService(
            whatsapp_client=whatsapp_client,
            supabase_client=supabase_client,
        )
        whatsapp_service.scope = scope
        logger.info("[startup] WhatsApp client initialized")
        # Warn if COACH_WHATSAPP_NUMBER is missing — coach will never receive
        # athlete message notifications or morning pulse summaries.
        if not settings.coach_whatsapp_number:
            logger.warning(
                "[startup] COACH_WHATSAPP_NUMBER is not set — coach will not receive "
                "WhatsApp notifications when athletes send messages. "
                "Set COACH_WHATSAPP_NUMBER in Railway environment variables (E.164 format: +12025551234). "
                "Alternatively, ensure coaches.whatsapp_number is populated in Supabase."
            )
    else:
        logger.warning("[startup] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — WhatsApp disabled")
    app.state.whatsapp_client = whatsapp_client
    app.state.whatsapp_service = whatsapp_service
    yield


app = FastAPI(title="Andes.IA API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # B-NEW-25: Removed hardcoded backend self-URL — the backend does not need
        # to allow CORS from itself. Only the frontend origins are legitimate CORS callers.
        "https://coach-dashboard-production-ae22.up.railway.app",
        "http://localhost:3000",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Hub-Signature-256"],
)


@app.middleware("http")
async def request_context_and_rate_limit(request: FastAPIRequest, call_next):
    request_id = uuid4().hex
    request.state.request_id = request_id
    rate_limiter = getattr(request.app.state, "rate_limiter", None)
    if rate_limiter is not None and hasattr(rate_limiter, "check"):
        client = request.client.host if request.client and request.client.host else "anonymous"
        try:
            result = await rate_limiter.check(client, bucket=request.url.path)
        except Exception:
            result = None
        if result is not None and not result.allowed:
            response = JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
            response.headers["retry-after"] = str(result.reset_after_seconds)
            response.headers["x-request-id"] = request_id
            return response
    response = await call_next(request)
    response.headers.setdefault("x-request-id", request_id)
    return response


app.include_router(v1_router)
app.include_router(methodology_router)
app.include_router(webhooks_router)
app.include_router(coach_router)
app.include_router(connect_router)
app.include_router(onboard_router)
app.include_router(athlete_portal_router)


@app.get("/health", tags=["health"])
async def health_check() -> dict:
    """Liveness probe for Railway and load balancers."""
    return {"status": "ok", "service": "coach-ai-backend"}


@app.get("/privacy", response_class=HTMLResponse)
async def privacy_policy():
    return """
    <html><head><title>Andes.IA Privacy Policy</title>
    <style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}</style>
    </head><body>
    <h1>Andes.IA Privacy Policy</h1>
    <p><strong>Last updated: April 14, 2026</strong></p>
    <p>Andes.IA ("we", "us") provides AI-powered coaching via WhatsApp.</p>
    <h2>Data We Collect</h2>
    <p>Your WhatsApp phone number, messages you send us, and workout/coaching data you provide.</p>
    <h2>How We Use It</h2>
    <p>To deliver personalized coaching responses and track your progress over time.</p>
    <h2>Data Storage</h2>
    <p>Your data is stored securely in our database. We do not sell or share your personal data with third parties.</p>
    <h2>Data Deletion</h2>
    <p>You can request deletion of your data at any time by messaging us DELETE MY DATA or emailing felipeddeidan@gmail.com.</p>
    <h2>Contact</h2>
    <p>felipeddeidan@gmail.com</p>
    </body></html>
    """


@app.get("/terms", response_class=HTMLResponse)
async def terms_of_service():
    return """
    <html><head><title>Andes.IA Terms of Service</title>
    <style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}</style>
    </head><body>
    <h1>Andes.IA Terms of Service</h1>
    <p><strong>Last updated: April 14, 2026</strong></p>
    <p>By using Andes.IA via WhatsApp, you agree to these terms.</p>
    <h2>Service</h2>
    <p>Andes.IA provides AI-generated coaching advice for fitness and lifestyle purposes. It is not a substitute for professional medical or fitness advice.</p>
    <h2>Eligibility</h2>
    <p>You must be 13 or older to use this service.</p>
    <h2>Acceptable Use</h2>
    <p>Do not misuse the service, attempt to reverse-engineer it, or use it for unlawful purposes.</p>
    <h2>Disclaimer</h2>
    <p>Coaching content is AI-generated and for informational purposes only. We are not liable for outcomes resulting from following AI advice.</p>
    <h2>Contact</h2>
    <p>felipeddeidan@gmail.com</p>
    </body></html>
    """
