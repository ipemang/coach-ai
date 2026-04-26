from __future__ import annotations
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4-turbo"
    stripe_secret_key: Optional[str] = None
    supabase_url: Optional[str] = None
    supabase_service_role_key: Optional[str] = None
    organization_id: str = "1"
    coach_id: str = "1"
    whatsapp_access_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    whatsapp_webhook_secret: Optional[str] = None
    coach_whatsapp_number: Optional[str] = None
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

def get_settings() -> Settings:
    return settings
