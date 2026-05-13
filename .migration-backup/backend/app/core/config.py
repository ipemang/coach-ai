from __future__ import annotations
import logging
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    # LLM model selection — read by LLMClient directly from env (LLM_PROVIDER, LLM_MODEL).
    # Do not add model defaults here; LLMClient owns that logic.
    stripe_secret_key: Optional[str] = None
    supabase_url: Optional[str] = None
    supabase_service_role_key: Optional[str] = None
    # B-07: Changed from str="1" to Optional — hardcoded defaults silently scoped
    # every athlete row to org/coach "1" when env vars were missing.
    organization_id: Optional[str] = None
    coach_id: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    whatsapp_webhook_secret: Optional[str] = None
    coach_whatsapp_number: Optional[str] = None
    # B-05: Shared secret for internal Next.js → backend server-to-server calls.
    # Set INTERNAL_API_SECRET in Railway env vars on both services.
    internal_api_secret: Optional[str] = None
    # COA-30: Strava OAuth2
    strava_client_id: Optional[str] = None
    strava_client_secret: Optional[str] = None
    strava_redirect_uri: Optional[str] = None
    # COA-93: Frontend base URL for invite links
    frontend_url: str = "https://coach-dashboard-production-ae22.up.railway.app"
    # B-NEW-05: Dedicated secret for invite token signing.
    # Falls back to supabase_service_role_key if not set (with startup warning).
    invite_secret: Optional[str] = None

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_file=".env",
        extra="ignore",
    )


settings = Settings()

# B-07: Warn loudly at startup if critical scope vars are missing.
if not settings.organization_id:
    logger.warning(
        "ORGANIZATION_ID env var is not set — webhook scope will be unconfigured. "
        "Set ORGANIZATION_ID in Railway environment variables."
    )
if not settings.coach_id:
    logger.warning(
        "COACH_ID env var is not set — webhook scope will be unconfigured. "
        "Set COACH_ID in Railway environment variables."
    )
if not settings.internal_api_secret:
    logger.warning(
        "INTERNAL_API_SECRET env var is not set — the suggestion send endpoint "
        "(/api/v1/coach/suggestions/{id}/send) is unprotected and accepts any request. "
        "Set INTERNAL_API_SECRET in Railway env vars on BOTH the backend and frontend services."
    )
if not settings.supabase_url or not settings.supabase_service_role_key:
    logger.warning(
        "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var is not set — "
        "all database operations will fail."
    )
if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
    logger.warning(
        "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID env var is not set — "
        "all WhatsApp sends will fail."
    )
# LLM provider — warn if neither key is set
_has_llm_key = settings.groq_api_key or settings.openai_api_key
if not _has_llm_key:
    logger.warning(
        "Neither GROQ_API_KEY nor OPENAI_API_KEY env var is set — "
        "all AI/LLM calls will fail at runtime. Set LLM_PROVIDER and the "
        "matching API key in Railway environment variables."
    )


def get_settings() -> Settings:
    return settings
