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

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_file=".env",
        extra="ignore"
    )

settings = Settings()

def get_settings():
    return settings

from .scope import DataScope, apply_scope_query, resolve_scope_from_env
from .whatsapp_service import WhatsAppRecipient, WhatsAppService
from .methodology_extractor import (
    METHODOLOGY_EXTRACTION_PROMPT,
    extract_methodology_from_transcript,
    persist_methodology_extraction
)
from .coach_workflow import update_coach_methodology

supabase_client = None
whatsapp_client = None
whatsapp_service = None
