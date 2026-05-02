from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import inspect
import json
import secrets
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Protocol
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

from app.services import get_settings
from app.services.biometrics import AthleteAuthContext, BiometricsService, Provider
from app.services.scope import DataScope, apply_scope_payload, apply_scope_query

ProviderName = Provider


DEFAULT_PROVIDER_SCOPES: dict[ProviderName, tuple[str, ...]] = {
    "garmin": ("activity:read_all", "sleep:read_all", "stress:read_all", "hrv:read_all"),
    "strava": ("read", "activity:read_all"),
    "oura": ("email", "daily:read_all", "workout:read_all"),
}


@dataclass(slots=True)
class IntegrationOAuthConfig:
    provider: ProviderName
    authorize_url: str
    token_url: str
    client_id: str
    client_secret: str
    redirect_uri: str
    scopes: tuple[str, ...]
    webhook_secret: str | None = None
    backfill_days: int = 90
    callback_path: str = ""


@dataclass(slots=True)
class AthleteIntegrationToken:
    athlete_id: str
    provider: ProviderName
    access_token: str
    refresh_token: str | None = None
    token_type: str | None = None
    expires_at: datetime | None = None
    provider_user_id: str | None = None
    scopes: list[str] = field(default_factory=list)
    raw_payload: dict[str, Any] = field(default_factory=dict)
    status: str = "connected"
    first_connected_at: datetime | None = None
    last_synced_at: datetime | None = None
    last_backfill_at: datetime | None = None
    next_sync_at: datetime | None = None
    organization_id: str | None = None
    coach_id: str | None = None
    webhook_subscription_id: str | None = None
    backfill_days: int = 90
    sync_enabled: bool = True
    connection_error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_row(self) -> dict[str, Any]:
        return {
            "athlete_id": self.athlete_id,
            "provider": self.provider,
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "token_type": self.token_type,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "provider_user_id": self.provider_user_id,
            "scopes": self.scopes,
            "raw_payload": _json_safe(self.raw_payload),
            "status": self.status,
            "first_connected_at": self.first_connected_at.isoformat() if self.first_connected_at else None,
            "last_synced_at": self.last_synced_at.isoformat() if self.last_synced_at else None,
            "last_backfill_at": self.last_backfill_at.isoformat() if self.last_backfill_at else None,
            "next_sync_at": self.next_sync_at.isoformat() if self.next_sync_at else None,
            "organization_id": self.organization_id,
            "coach_id": self.coach_id,
            "webhook_subscription_id": self.webhook_subscription_id,
            "backfill_days": self.backfill_days,
            "sync_enabled": self.sync_enabled,
            "connection_error": self.connection_error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def to_auth_context(self) -> AthleteAuthContext:
        return AthleteAuthContext(
            athlete_id=self.athlete_id,
            provider=self.provider,
            credential_payload={
                "access_token": self.access_token,
                "refresh_token": self.refresh_token,
                "token_type": self.token_type,
                "expires_at": self.expires_at.isoformat() if self.expires_at else None,
                "provider_user_id": self.provider_user_id,
                "scopes": list(self.scopes),
                "raw_payload": self.raw_payload,
            },
        )


@dataclass(slots=True)
class OAuthStatePayload:
    provider: ProviderName
    athlete_id: str
    organization_id: str | None = None
    coach_id: str | None = None
    redirect_uri: str | None = None
    scopes: list[str] = field(default_factory=list)
    nonce: str = field(default_factory=lambda: secrets.token_urlsafe(16))
    issued_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def encode(self, secret: str) -> str:
        payload = {
            "provider": self.provider,
            "athlete_id": self.athlete_id,
            "organization_id": self.organization_id,
            "coach_id": self.coach_id,
            "redirect_uri": self.redirect_uri,
            "scopes": self.scopes,
            "nonce": self.nonce,
            "issued_at": self.issued_at,
        }
        payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        payload_segment = _base64url_encode(payload_json)
        signature = hmac.new(secret.encode("utf-8"), payload_segment.encode("ascii"), hashlib.sha256).digest()
        return f"{payload_segment}.{_base64url_encode(signature)}"

    @classmethod
    def decode(cls, token: str, secret: str) -> "OAuthStatePayload":
        try:
            payload_segment, signature_segment = token.split(".", 1)
        except ValueError as exc:
            raise ValueError("Invalid OAuth state") from exc

        expected_signature = hmac.new(secret.encode("utf-8"), payload_segment.encode("ascii"), hashlib.sha256).digest()
        received_signature = _base64url_decode(signature_segment)
        if not hmac.compare_digest(expected_signature, received_signature):
            raise ValueError("Invalid OAuth state")

        try:
            payload = json.loads(_base64url_decode(payload_segment).decode("utf-8"))
        except Exception as exc:
            raise ValueError("Invalid OAuth state") from exc

        if not isinstance(payload, dict):
            raise ValueError("Invalid OAuth state")

        return cls(
            provider=str(payload["provider"]),
            athlete_id=str(payload["athlete_id"]),
            organization_id=_string_value(payload.get("organization_id")),
            coach_id=_string_value(payload.get("coach_id")),
            redirect_uri=_string_value(payload.get("redirect_uri")),
            scopes=[str(value) for value in (payload.get("scopes") or []) if str(value).strip()],
            nonce=str(payload.get("nonce") or secrets.token_urlsafe(16)),
            issued_at=str(payload.get("issued_at") or datetime.now(timezone.utc).isoformat()),
        )


@dataclass(slots=True)
class IntegrationConnectionResult:
    provider: ProviderName
    athlete_id: str
    token: AthleteIntegrationToken
    first_connection: bool
    backfill_started: bool = False
    backfill_days: int = 90
    token_row: dict[str, Any] = field(default_factory=dict)


class SupabaseClientProtocol(Protocol):
    async def table(self, name: str) -> Any:  # pragma: no cover - runtime adapter
        ...


class IntegrationService:
    def __init__(
        self,
        supabase_client: SupabaseClientProtocol | None = None,
        biometrics_service: BiometricsService | None = None,
        scope: DataScope | None = None,
    ) -> None:
        self.supabase_client = supabase_client
        self.biometrics_service = biometrics_service
        self.scope = scope
        self.settings = get_settings()

    def oauth_config(self, provider: ProviderName) -> IntegrationOAuthConfig:
        authorize_url = getattr(self.settings, f"{provider}_oauth_authorize_url", None)
        token_url = getattr(self.settings, f"{provider}_oauth_token_url", None)
        client_id = getattr(self.settings, f"{provider}_oauth_client_id", None)
        client_secret = getattr(self.settings, f"{provider}_oauth_client_secret", None)
        redirect_uri = getattr(self.settings, f"{provider}_oauth_redirect_uri", None)
        scopes_raw = getattr(self.settings, f"{provider}_oauth_scopes", None)
        webhook_secret = getattr(self.settings, f"{provider}_oauth_webhook_secret", None)

        scopes = _scope_list(scopes_raw) or list(DEFAULT_PROVIDER_SCOPES[provider])
        missing = [name for name, value in (("authorize_url", authorize_url), ("token_url", token_url), ("client_id", client_id), ("client_secret", client_secret), ("redirect_uri", redirect_uri)) if not _string_value(value)]
        if missing:
            raise RuntimeError(f"{provider.title()} OAuth is not configured: missing {', '.join(missing)}")

        return IntegrationOAuthConfig(
            provider=provider,
            authorize_url=str(authorize_url),
            token_url=str(token_url),
            client_id=str(client_id),
            client_secret=str(client_secret),
            redirect_uri=str(redirect_uri),
            scopes=tuple(scopes),
            webhook_secret=_string_value(webhook_secret),
            backfill_days=90,
            callback_path=f"/api/v1/integrations/{provider}/callback",
        )

    def build_authorize_url(
        self,
        provider: ProviderName,
        *,
        athlete_id: str,
        organization_id: str | None = None,
        coach_id: str | None = None,
        redirect_uri: str | None = None,
    ) -> tuple[str, OAuthStatePayload, IntegrationOAuthConfig]:
        config = self.oauth_config(provider)
        state_payload = OAuthStatePayload(
            provider=provider,
            athlete_id=athlete_id,
            organization_id=organization_id,
            coach_id=coach_id,
            redirect_uri=redirect_uri or config.redirect_uri,
            scopes=list(config.scopes),
        )
        state_secret = _state_secret()
        state = state_payload.encode(state_secret)
        query = {
            "client_id": config.client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri or config.redirect_uri,
            "scope": " ".join(config.scopes),
            "state": state,
        }
        authorize_url = _set_query_params(config.authorize_url, query)
        return authorize_url, state_payload, config

    async def connect_from_code(
        self,
        provider: ProviderName,
        *,
        code: str,
        state: str,
    ) -> IntegrationConnectionResult:
        state_payload = OAuthStatePayload.decode(state, _state_secret())
        if state_payload.provider != provider:
            raise ValueError("OAuth state provider mismatch")

        config = self.oauth_config(provider)
        token_payload = await self._exchange_code_for_tokens(config, code)
        token = self._normalize_token_payload(
            provider=provider,
            athlete_id=state_payload.athlete_id,
            organization_id=state_payload.organization_id,
            coach_id=state_payload.coach_id,
            token_payload=token_payload,
        )

        first_connection = await self._upsert_token(token)
        backfill_started = False
        if first_connection:
            backfill_started = await self._start_initial_backfill(token, days=config.backfill_days)

        return IntegrationConnectionResult(
            provider=provider,
            athlete_id=token.athlete_id,
            token=token,
            first_connection=first_connection,
            backfill_started=backfill_started,
            backfill_days=config.backfill_days,
            token_row=token.to_row(),
        )

    async def get_connection(self, provider: ProviderName, athlete_id: str) -> dict[str, Any] | None:
        row = await self._find_token_row(provider, athlete_id)
        return row

    async def handle_webhook(
        self,
        provider: ProviderName,
        payload: dict[str, Any],
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        athlete_id = _extract_athlete_id(payload)
        provider_user_id = _extract_provider_user_id(payload)
        if athlete_id is None and provider_user_id is None:
            raise ValueError("Webhook payload did not include athlete_id or provider_user_id")

        row = await self._find_token_row(provider, athlete_id, provider_user_id=provider_user_id)
        if row is None:
            return {"status": "ignored", "reason": "integration not found"}

        token = self._row_to_token(row)
        sync_result = await self._sync_recent_data(token, now=now)
        return {
            "status": "synced",
            "provider": provider,
            "athlete_id": token.athlete_id,
            "synced_days": sync_result,
        }

    async def backfill_last_n_days(
        self,
        provider: ProviderName,
        athlete_id: str,
        days: int = 90,
    ) -> dict[str, Any]:
        row = await self._find_token_row(provider, athlete_id)
        if row is None:
            raise ValueError(f"No {provider} integration found for athlete {athlete_id}")
        token = self._row_to_token(row)
        synced_days = await self._sync_days(token, days=days)
        await self._mark_backfill_complete(token, days=days)
        return {"provider": provider, "athlete_id": athlete_id, "synced_days": synced_days, "backfill_days": days}

    async def sync_all_active_connections(self, *, now: datetime | None = None) -> dict[str, Any]:
        rows = await self._list_active_tokens()
        synced: list[dict[str, Any]] = []
        for row in rows:
            token = self._row_to_token(row)
            try:
                synced_days = await self._sync_recent_data(token, now=now)
            except NotImplementedError:
                synced_days = []
            synced.append({"provider": token.provider, "athlete_id": token.athlete_id, "synced_days": synced_days})
        return {"synced": synced, "count": len(synced)}

    async def _start_initial_backfill(self, token: AthleteIntegrationToken, *, days: int) -> bool:
        try:
            await self._sync_days(token, days=days)
            await self._mark_backfill_complete(token, days=days)
            return True
        except NotImplementedError:
            # The service still records the connection; provider adapters can be
            # wired later without changing the auth flow or schema.
            await self._mark_backfill_requested(token, days=days)
            return False

    async def _sync_recent_data(self, token: AthleteIntegrationToken, *, now: datetime | None = None) -> list[str]:
        anchor = now or datetime.now(timezone.utc)
        last_synced = token.last_synced_at or token.first_connected_at or (anchor - timedelta(days=1))
        start_day = last_synced.date()
        end_day = anchor.date()
        days = _date_range(start_day, end_day)
        return await self._sync_days(token, days=days)

    async def _sync_days(self, token: AthleteIntegrationToken, *, days: int | list[date]) -> list[str]:
        if self.biometrics_service is None:
            raise NotImplementedError("Biometrics service is not configured")

        if isinstance(days, int):
            end_day = datetime.now(timezone.utc).date()
            start_day = end_day - timedelta(days=max(days - 1, 0))
            day_list = _date_range(start_day, end_day)
        else:
            day_list = days

        context = token.to_auth_context()
        synced_days: list[str] = []
        for day in day_list:
            await self.biometrics_service.sync_daily_biometrics(context, day)
            synced_days.append(day.isoformat())

        token.last_synced_at = datetime.now(timezone.utc)
        token.updated_at = datetime.now(timezone.utc)
        await self._upsert_token(token)
        return synced_days

    async def _mark_backfill_complete(self, token: AthleteIntegrationToken, *, days: int) -> None:
        token.last_backfill_at = datetime.now(timezone.utc)
        token.backfill_days = days
        token.connection_error = None
        token.updated_at = datetime.now(timezone.utc)
        await self._upsert_token(token)

    async def _mark_backfill_requested(self, token: AthleteIntegrationToken, *, days: int) -> None:
        token.last_backfill_at = None
        token.backfill_days = days
        token.connection_error = None
        token.updated_at = datetime.now(timezone.utc)
        await self._upsert_token(token)

    async def _exchange_code_for_tokens(self, config: IntegrationOAuthConfig, code: str) -> dict[str, Any]:
        form = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "redirect_uri": config.redirect_uri,
        }
        request = Request(
            config.token_url,
            data=urlencode(form).encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=90) as response:
            raw = response.read().decode("utf-8")
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {key: values[0] if len(values) == 1 else values for key, values in parse_qs(raw).items()}
        if not isinstance(parsed, dict):
            raise RuntimeError("OAuth token response was not a JSON object")
        return parsed

    def _normalize_token_payload(
        self,
        *,
        provider: ProviderName,
        athlete_id: str,
        organization_id: str | None,
        coach_id: str | None,
        token_payload: dict[str, Any],
    ) -> AthleteIntegrationToken:
        now = datetime.now(timezone.utc)
        expires_at = _parse_datetime(token_payload.get("expires_at") or token_payload.get("expiresAt"))
        if expires_at is None:
            expires_in = token_payload.get("expires_in") or token_payload.get("expiresIn")
            if expires_in is not None:
                try:
                    expires_at = now + timedelta(seconds=int(expires_in))
                except (TypeError, ValueError):
                    expires_at = None

        scopes = _scope_list(token_payload.get("scope") or token_payload.get("scopes"))
        if not scopes:
            scopes = list(DEFAULT_PROVIDER_SCOPES[provider])

        return AthleteIntegrationToken(
            athlete_id=athlete_id,
            provider=provider,
            access_token=str(token_payload.get("access_token") or token_payload.get("accessToken") or ""),
            refresh_token=_string_value(token_payload.get("refresh_token") or token_payload.get("refreshToken")),
            token_type=_string_value(token_payload.get("token_type") or token_payload.get("tokenType") or "Bearer"),
            expires_at=expires_at,
            provider_user_id=_string_value(
                token_payload.get("provider_user_id")
                or token_payload.get("providerUserId")
                or token_payload.get("athlete_id")
                or token_payload.get("athleteId")
                or token_payload.get("user_id")
                or token_payload.get("userId")
            ),
            scopes=scopes,
            raw_payload=_json_safe(token_payload),
            status="connected",
            first_connected_at=now,
            last_synced_at=None,
            last_backfill_at=None,
            next_sync_at=None,
            organization_id=organization_id,
            coach_id=coach_id,
            backfill_days=90,
            sync_enabled=True,
            created_at=now,
            updated_at=now,
        )

    async def _upsert_token(self, token: AthleteIntegrationToken) -> bool:
        table = await self._resolve_table("athlete_integrations")
        payload = apply_scope_payload(token.to_row(), self.scope)
        existing = await self._find_token_row(token.provider, token.athlete_id, provider_user_id=token.provider_user_id)
        if existing is None:
            result = table.upsert(payload)
            if hasattr(result, "execute"):
                await result.execute()
            else:
                await result
            return True

        merged = {**existing, **payload}
        if "first_connected_at" not in payload or not payload.get("first_connected_at"):
            merged["first_connected_at"] = existing.get("first_connected_at") or payload.get("first_connected_at")
        result = table.update(merged)
        if hasattr(result, "eq"):
            query = result.eq("provider", token.provider).eq("athlete_id", token.athlete_id)
            if hasattr(query, "execute"):
                await query.execute()
            else:
                await query
        elif hasattr(result, "execute"):
            await result.execute()
        else:
            await result
        return False

    async def _find_token_row(
        self,
        provider: ProviderName,
        athlete_id: str | None,
        *,
        provider_user_id: str | None = None,
    ) -> dict[str, Any] | None:
        table = await self._resolve_table("athlete_integrations")
        query = table.select("*") if hasattr(table, "select") else table
        if hasattr(query, "eq"):
            query = query.eq("provider", provider)
            if athlete_id is not None:
                query = query.eq("athlete_id", athlete_id)
            if provider_user_id is not None:
                query = query.eq("provider_user_id", provider_user_id)
        query = apply_scope_query(query, self.scope)
        rows = await _query_rows(query)
        return rows[0] if rows else None

    async def _list_active_tokens(self) -> list[dict[str, Any]]:
        table = await self._resolve_table("athlete_integrations")
        query = table.select("*") if hasattr(table, "select") else table
        if hasattr(query, "eq"):
            query = query.eq("status", "connected")
        query = apply_scope_query(query, self.scope)
        return await _query_rows(query)

    async def _resolve_table(self, table_name: str) -> Any:
        if self.supabase_client is None:
            raise RuntimeError("Supabase client is not configured")
        table = self.supabase_client.table(table_name)
        if inspect.isawaitable(table):
            table = await table
        return table

    def _row_to_token(self, row: dict[str, Any]) -> AthleteIntegrationToken:
        return AthleteIntegrationToken(
            athlete_id=str(row.get("athlete_id") or row.get("athleteId") or ""),
            provider=str(row.get("provider") or ""),
            access_token=str(row.get("access_token") or ""),
            refresh_token=_string_value(row.get("refresh_token")),
            token_type=_string_value(row.get("token_type")),
            expires_at=_parse_datetime(row.get("expires_at")),
            provider_user_id=_string_value(row.get("provider_user_id")),
            scopes=_normalize_string_list(row.get("scopes")),
            raw_payload=row.get("raw_payload") if isinstance(row.get("raw_payload"), dict) else {},
            status=_string_value(row.get("status")) or "connected",
            first_connected_at=_parse_datetime(row.get("first_connected_at")),
            last_synced_at=_parse_datetime(row.get("last_synced_at")),
            last_backfill_at=_parse_datetime(row.get("last_backfill_at")),
            next_sync_at=_parse_datetime(row.get("next_sync_at")),
            organization_id=_string_value(row.get("organization_id")),
            coach_id=_string_value(row.get("coach_id")),
            webhook_subscription_id=_string_value(row.get("webhook_subscription_id")),
            backfill_days=int(row.get("backfill_days") or 90),
            sync_enabled=bool(row.get("sync_enabled", True)),
            connection_error=_string_value(row.get("connection_error")),
            created_at=_parse_datetime(row.get("created_at")) or datetime.now(timezone.utc),
            updated_at=_parse_datetime(row.get("updated_at")) or datetime.now(timezone.utc),
        )


class IntegrationSyncWorker:
    def __init__(
        self,
        integration_service: IntegrationService,
        poll_interval_seconds: int = 300,
    ) -> None:
        self.integration_service = integration_service
        self.poll_interval_seconds = poll_interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()

    async def run_once(self) -> dict[str, Any]:
        return await self.integration_service.sync_all_active_connections()

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_forever())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run_forever(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.run_once()
            except Exception:
                # The worker is best-effort; failures are retried on the next cycle.
                pass
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_seconds)
            except asyncio.TimeoutError:
                continue


async def _query_rows(query: Any) -> list[dict[str, Any]]:
    if hasattr(query, "execute"):
        response = await query.execute()
    elif hasattr(query, "__await__"):
        response = await query
    else:
        response = query
    return _extract_rows(response)


def _extract_rows(response: Any) -> list[dict[str, Any]]:
    if response is None:
        return []
    if isinstance(response, list):
        return [row for row in response if isinstance(row, dict)]
    if isinstance(response, dict):
        data = response.get("data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        if isinstance(data, dict):
            return [data]
        if any(isinstance(value, (str, int, float, bool)) or value is None for value in response.values()):
            return [response]
        return []
    if hasattr(response, "data"):
        data = getattr(response, "data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        if isinstance(data, dict):
            return [data]
    return []


def _normalize_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(" ") if item.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _scope_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        separators = [",", " "]
        for separator in separators:
            if separator in value:
                return [item.strip() for item in value.split(separator) if item.strip()]
        return [value.strip()] if value.strip() else []
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _state_secret() -> str:
    settings = get_settings()
    return getattr(settings, "supabase_service_role_key", "integration-state-secret")


def _set_query_params(url: str, params: dict[str, Any]) -> str:
    parsed = urlparse(url)
    existing = parse_qs(parsed.query, keep_blank_values=True)
    for key, value in params.items():
        if value is None:
            continue
        existing[key] = [str(value)]
    query = urlencode(existing, doseq=True)
    return urlunparse(parsed._replace(query=query))


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time(), tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if hasattr(value, "model_dump"):
        return _json_safe(value.model_dump())
    if hasattr(value, "dict"):
        return _json_safe(value.dict())
    return value


def _date_range(start_day: date, end_day: date) -> list[date]:
    if end_day < start_day:
        return []
    days: list[date] = []
    current = start_day
    while current <= end_day:
        days.append(current)
        current += timedelta(days=1)
    return days


def _extract_athlete_id(payload: dict[str, Any]) -> str | None:
    for key in ("athlete_id", "athleteId", "user_id", "userId"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
    return None


def _extract_provider_user_id(payload: dict[str, Any]) -> str | None:
    for key in ("provider_user_id", "providerUserId", "user_id", "userId", "athlete_id", "athleteId"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
    return None


__all__ = [
    "AthleteIntegrationToken",
    "DEFAULT_PROVIDER_SCOPES",
    "IntegrationConnectionResult",
    "IntegrationOAuthConfig",
    "IntegrationService",
    "IntegrationSyncWorker",
    "OAuthStatePayload",
]
