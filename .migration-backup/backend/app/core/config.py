from __future__ import annotations
import logging
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4-turbo"
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


def get_settings() -> Settings:
    return settings
