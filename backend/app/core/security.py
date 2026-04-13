from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException, Request as FastAPIRequest
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.services.scope import DataScope


@dataclass(slots=True)
class AuthenticatedPrincipal:
    user_id: str
    email: str | None = None
    roles: frozenset[str] = frozenset({"authenticated"})
    organization_id: str | None = None
    coach_id: str | None = None
    raw_claims: dict[str, Any] = field(default_factory=dict)
    access_token: str | None = None

    def has_role(self, *roles: str) -> bool:
        normalized = {role.strip().lower() for role in roles if role and role.strip()}
        return bool(self.roles.intersection(normalized))


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _normalize_roles(*values: Any) -> frozenset[str]:
    roles: set[str] = {"authenticated"}
    for value in values:
        if isinstance(value, str):
            stripped = value.strip().lower()
            if stripped:
                roles.add(stripped)
        elif isinstance(value, (list, tuple, set, frozenset)):
            for item in value:
                if isinstance(item, str):
                    stripped = item.strip().lower()
                    if stripped:
                        roles.add(stripped)
    return frozenset(roles)


def _extract_token(request: FastAPIRequest) -> str:
    authorization = request.headers.get("authorization") or ""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return token.strip()


def _build_supabase_user_url() -> str:
    settings = get_settings()
    if not settings.supabase_url:
        raise HTTPException(status_code=503, detail="Supabase URL is not configured")
    return f"{settings.supabase_url.rstrip('/')}/auth/v1/user"


def _fetch_supabase_user(token: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Supabase service role key is not configured")

    request = Request(
        _build_supabase_user_url(),
        method="GET",
        headers={
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=15) as response:
            payload = response.read().decode("utf-8")
            parsed = json.loads(payload) if payload else {}
    except HTTPError as exc:
        detail = "Invalid or expired access token"
        if exc.fp is not None:
            try:
                error_payload = json.loads(exc.read().decode("utf-8"))
                detail = _string_value(error_payload.get("msg") or error_payload.get("message") or error_payload.get("error")) or detail
            except Exception:
                pass
        raise HTTPException(status_code=401, detail=detail) from exc
    except (URLError, TimeoutError) as exc:
        raise HTTPException(status_code=503, detail="Authentication service is unavailable") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=401, detail="Invalid authentication response")
    return parsed


def _extract_scope_claims(data: dict[str, Any]) -> tuple[str | None, str | None]:
    for container_name in ("app_metadata", "user_metadata"):
        container = data.get(container_name)
        if not isinstance(container, dict):
            continue
        organization_id = _string_value(
            container.get("organization_id")
            or container.get("organizationId")
            or container.get("org_id")
            or container.get("orgId")
        )
        coach_id = _string_value(container.get("coach_id") or container.get("coachId"))
        if organization_id or coach_id:
            return organization_id, coach_id

    organization_id = _string_value(data.get("organization_id") or data.get("organizationId") or data.get("org_id") or data.get("orgId"))
    coach_id = _string_value(data.get("coach_id") or data.get("coachId"))
    return organization_id, coach_id


def _extract_roles(data: dict[str, Any]) -> frozenset[str]:
    roles: list[Any] = []
    for container_name in ("app_metadata", "user_metadata"):
        container = data.get(container_name)
        if isinstance(container, dict):
            roles.extend([container.get("roles"), container.get("role"), container.get("permissions")])
    roles.extend([data.get("roles"), data.get("role")])
    return _normalize_roles(*roles)


async def authenticate_request(request: FastAPIRequest) -> AuthenticatedPrincipal:
    token = _extract_token(request)
    data = await run_in_threadpool(_fetch_supabase_user, token)

    user_id = _string_value(data.get("id") or data.get("user_id") or data.get("sub"))
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication payload missing user id")

    organization_id, coach_id = _extract_scope_claims(data)
    principal = AuthenticatedPrincipal(
        user_id=user_id,
        email=_string_value(data.get("email")),
        roles=_extract_roles(data),
        organization_id=organization_id,
        coach_id=coach_id,
        raw_claims=data,
        access_token=token,
    )
    return principal


def require_roles(*allowed_roles: str) -> Callable[[FastAPIRequest], Awaitable[AuthenticatedPrincipal]]:
    normalized_allowed = {role.strip().lower() for role in allowed_roles if role and role.strip()}

    async def dependency(request: FastAPIRequest) -> AuthenticatedPrincipal:
        principal = await authenticate_request(request)
        if normalized_allowed and not principal.roles.intersection(normalized_allowed):
            raise HTTPException(status_code=403, detail="Insufficient role for this route")
        return principal

    return dependency


def resolve_coach_scope(
    principal: AuthenticatedPrincipal,
    *,
    organization_id: str | None = None,
    coach_id: str | None = None,
    fallback_scope: DataScope | None = None,
) -> DataScope:
    if principal.has_role("admin"):
        resolved = DataScope(
            organization_id=organization_id or principal.organization_id or (fallback_scope.organization_id if fallback_scope else None),
            coach_id=coach_id or principal.coach_id or (fallback_scope.coach_id if fallback_scope else None),
        )
        if not resolved.is_configured():
            raise HTTPException(status_code=503, detail="Coach scope is not configured")
        return resolved

    if not principal.has_role("coach"):
        raise HTTPException(status_code=403, detail="Coach access required")
    if not principal.organization_id or not principal.coach_id:
        raise HTTPException(status_code=403, detail="Authenticated coach scope is not configured")
    if organization_id is not None and organization_id != principal.organization_id:
        raise HTTPException(status_code=403, detail="Coach cannot access another organization")
    if coach_id is not None and coach_id != principal.coach_id:
        raise HTTPException(status_code=403, detail="Coach cannot access another coach record")

    return DataScope(organization_id=principal.organization_id, coach_id=principal.coach_id)


def verify_whatsapp_signature(request: FastAPIRequest, raw_body: bytes | None = None) -> None:
    settings = get_settings()
    secret = _string_value(getattr(settings, "whatsapp_webhook_secret", None))
    if not secret:
        raise HTTPException(status_code=503, detail="WhatsApp webhook secret is not configured")

    signature_header = request.headers.get("x-hub-signature-256") or request.headers.get("x-hub-signature")
    if not signature_header:
        raise HTTPException(status_code=401, detail="Missing WhatsApp webhook signature")

    algorithm, separator, signature = signature_header.partition("=")
    if not separator or algorithm.lower() != "sha256":
        raise HTTPException(status_code=401, detail="Unsupported WhatsApp webhook signature")

    body = raw_body if raw_body is not None else getattr(request, "_body", None)
    if body is None:
        raise HTTPException(status_code=400, detail="Webhook body could not be read")

    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature.strip()):
        raise HTTPException(status_code=401, detail="Invalid WhatsApp webhook signature")
