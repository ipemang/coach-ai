"""COA-66: Field-level encryption for athlete health records.

Each athlete has a unique Fernet key, itself encrypted by a master key
stored in the HEALTH_ENCRYPTION_MASTER_KEY environment variable.

If HEALTH_ENCRYPTION_MASTER_KEY is not set (e.g. local dev without secrets),
the athlete key is stored as-is (base64 encoded) — still not plaintext values
in health records, but without the extra master-key envelope.

Usage:
    key = get_or_create_athlete_key(supabase, athlete_id)
    encrypted = encrypt_health_values(key, {"body_fat_pct": 18.3, "ferritin": 42})
    values = decrypt_health_values(key, encrypted)
"""
from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

try:
    from cryptography.fernet import Fernet, InvalidToken
    _FERNET_AVAILABLE = True
except ImportError:
    _FERNET_AVAILABLE = False
    logger.warning("[health_encryption] cryptography package not installed — encryption disabled")


def _get_master_fernet() -> "Fernet | None":
    """Load master Fernet from env var, or None if not configured."""
    if not _FERNET_AVAILABLE:
        return None
    raw = os.environ.get("HEALTH_ENCRYPTION_MASTER_KEY", "").strip()
    if not raw:
        return None
    try:
        return Fernet(raw.encode() if isinstance(raw, str) else raw)
    except Exception as exc:
        logger.warning("[health_encryption] Invalid HEALTH_ENCRYPTION_MASTER_KEY: %s", exc)
        return None


def get_or_create_athlete_key(supabase: Any, athlete_id: str) -> "Fernet | None":
    """Return a Fernet key for the athlete, creating and persisting one if needed.

    Returns None if the cryptography package is unavailable.
    """
    if not _FERNET_AVAILABLE:
        return None

    master = _get_master_fernet()

    # Try to load existing key from DB
    try:
        row = (
            supabase.table("athlete_encryption_keys")
            .select("encrypted_key")
            .eq("athlete_id", athlete_id)
            .maybe_single()
            .execute()
        )
        if row.data:
            stored = row.data["encrypted_key"]
            if master:
                # stored value is master-encrypted
                athlete_key_bytes = master.decrypt(stored.encode())
            else:
                # stored value is plain base64 (dev mode)
                athlete_key_bytes = base64.urlsafe_b64decode(stored.encode())
            return Fernet(athlete_key_bytes)
    except InvalidToken:
        logger.error(
            "[health_encryption] Could not decrypt key for athlete=%s — master key mismatch?",
            athlete_id[:8],
        )
        raise
    except Exception as exc:
        logger.warning("[health_encryption] Key lookup failed for athlete=%s: %s", athlete_id[:8], exc)
        # Fall through to create

    # Generate a fresh key
    athlete_key = Fernet.generate_key()
    if master:
        stored_value = master.encrypt(athlete_key).decode()
    else:
        # Dev mode: store as plain base64
        stored_value = base64.urlsafe_b64encode(athlete_key).decode()

    try:
        supabase.table("athlete_encryption_keys").upsert(
            {"athlete_id": athlete_id, "encrypted_key": stored_value},
            on_conflict="athlete_id",
        ).execute()
    except Exception as exc:
        logger.warning("[health_encryption] Key persist failed for athlete=%s: %s", athlete_id[:8], exc)

    return Fernet(athlete_key)


def encrypt_health_values(fernet: "Fernet", values: dict[str, Any]) -> bytes:
    """Encrypt a dict of health values into an opaque bytes token."""
    payload = json.dumps(values, default=str).encode()
    return fernet.encrypt(payload)


def decrypt_health_values(fernet: "Fernet", encrypted: bytes) -> dict[str, Any]:
    """Decrypt bytes token back to a dict. Raises InvalidToken on tamper."""
    raw = fernet.decrypt(encrypted)
    return json.loads(raw.decode())
