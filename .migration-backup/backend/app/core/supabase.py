"""Shared Supabase service-role client for v1 API modules.

All v1 route handlers that need DB access call get_supabase_client().
The client uses the service role key and therefore bypasses RLS — it is
never exposed to the browser and is only used server-side.
"""
from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Return a cached Supabase service-role client.

    The lru_cache ensures a single client instance is reused across the
    lifetime of the process (Railway container). If Supabase credentials
    are missing the function raises RuntimeError so misconfigured deploys
    fail loudly at first use rather than silently returning None.
    """
    settings = get_settings()
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL environment variable is not set")
    if not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY environment variable is not set")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
