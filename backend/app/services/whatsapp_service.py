"""Outbound WhatsApp messaging for scheduled check-ins."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol

from app.services.scope import DataScope, apply_scope_payload, apply_scope_query, require_scope
from zoneinfo import ZoneInfo

from app.models.checkinsend_log import CheckinSendLog


class SupabaseClientProtocol(Protocol):
    async def table(self, name: str) -> Any:  # pragma: no cover - runtime adapter
        ...


class WhatsAppClientProtocol(Protocol):
    async def send_message(self, to: str, body: str, **kwargs: Any) -> Any:  # pragma: no cover - runtime adapter
        ...


@dataclass(slots=True)
class WhatsAppRecipient:
    athlete_id: str
    phone_number: str
    timezone_name: str
    display_name: str | None = None


@dataclass(slots=True)
class WhatsAppSendResult:
    recipient: WhatsAppRecipient
    body: str
    delivered: bool = True
    attempts: int = 1
    provider_message_id: str | None = None
    error_message: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class WhatsAppService:
    """Encapsulates message generation, delivery, and send-log updates."""

    whatsapp_client: WhatsAppClientProtocol
    supabase_client: SupabaseClientProtocol | None = None
    send_log_table: str = "checkin_send_logs"
    scope: DataScope | None = None

    async def send_text_message(
        self,
        recipient: WhatsAppRecipient,
        body: str,
        **kwargs: Any,
    ) -> WhatsAppSendResult:
        """Send an arbitrary WhatsApp text message through the provider client."""

        last_error: Exception | None = None
        provider_response: Any = None
        attempts = 0

        for attempt in range(2):
            attempts = attempt + 1
            try:
                provider_response = await self.whatsapp_client.send_message(
                    to=recipient.phone_number,
                    body=body,
                    **kwargs,
                )
                last_error = None
                break
            except Exception as exc:  # pragma: no cover - downstream transport failure
                last_error = exc
                if attempt == 0:
                    continue

        if last_error is not None:
            return WhatsAppSendResult(
                recipient=recipient,
                body=body,
                delivered=False,
                attempts=attempts,
                error_message=str(last_error),
                raw={"error": str(last_error), "attempts": attempts},
            )

        return WhatsAppSendResult(
            recipient=recipient,
            body=body,
            delivered=True,
            attempts=attempts,
            provider_message_id=self._extract_provider_message_id(provider_response),
            raw=self._normalize_response(provider_response),
        )

    def build_checkin_message(
        self,
        recipient: WhatsAppRecipient,
        scheduled_for: datetime,
        checkin_link: str | None = None,
    ) -> str:
        """Build a localized, athlete-facing check-in message."""

        local_dt = scheduled_for.astimezone(ZoneInfo(recipient.timezone_name))
        greeting_name = recipient.display_name or "there"
        parts = [
            f"Hi {greeting_name}, quick check-in for {local_dt.strftime('%A')}.",
            "How are you feeling today?",
        ]
        if checkin_link:
            parts.append(f"Reply here: {checkin_link}")
        return " ".join(parts)

    async def send_checkin_message(
        self,
        recipient: WhatsAppRecipient,
        scheduled_for: datetime,
        checkin_link: str | None = None,
        send_log: CheckinSendLog | None = None,
    ) -> WhatsAppSendResult:
        """Send a WhatsApp check-in and update the send log if configured."""

        if scheduled_for.tzinfo is None:
            raise ValueError("scheduled_for must be timezone-aware")

        body = self.build_checkin_message(recipient, scheduled_for, checkin_link=checkin_link)
        send_log = send_log or CheckinSendLog(
            athlete_id=recipient.athlete_id,
            scheduled_for=scheduled_for,
            timezone_name=recipient.timezone_name,
            message_fingerprint=self._fingerprint_message(body),
        )

        if send_log.status == "sent":
            return WhatsAppSendResult(
                recipient=recipient,
                body=body,
                delivered=True,
                attempts=0,
                provider_message_id=send_log.provider_message_id,
            )

        result = await self.send_text_message(
            recipient,
            body,
            athlete_id=recipient.athlete_id,
            scheduled_for=scheduled_for.isoformat(),
            dedupe_key=send_log.dedupe_key,
        )

        if result.delivered:
            await self._mark_send_log_sent(send_log, provider_message_id=result.provider_message_id)
            return result

        await self._mark_send_log_failed(send_log, error_message=result.error_message)
        return result

    async def _mark_send_log_sent(
        self,
        send_log: CheckinSendLog,
        *,
        provider_message_id: str | None,
    ) -> None:
        if self.supabase_client is None:
            return

        scope = require_scope(self.scope, context="WhatsApp send log update")
        table = self.supabase_client.table(self.send_log_table)
        payload = {
            "status": "sent",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "provider_message_id": provider_message_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "error_message": None,
        }

        if hasattr(table, "update") and hasattr(table, "eq"):
            updater = apply_scope_query(table.update(payload).eq("dedupe_key", send_log.dedupe_key), scope)
            if hasattr(updater, "execute"):
                await updater.execute()
            else:
                await updater
            return

        if hasattr(table, "upsert"):
            await table.upsert(apply_scope_payload({**send_log.to_row(), **payload}, scope))
            return

    async def _mark_send_log_failed(
        self,
        send_log: CheckinSendLog,
        *,
        error_message: str | None,
    ) -> None:
        if self.supabase_client is None:
            return

        scope = require_scope(self.scope, context="WhatsApp send log update")
        table = self.supabase_client.table(self.send_log_table)
        payload = {
            "status": "failed",
            "error_message": error_message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if hasattr(table, "update") and hasattr(table, "eq"):
            updater = apply_scope_query(table.update(payload).eq("dedupe_key", send_log.dedupe_key), scope)
            if hasattr(updater, "execute"):
                await updater.execute()
            else:
                await updater
            return

        if hasattr(table, "upsert"):
            await table.upsert(apply_scope_payload({**send_log.to_row(), **payload}, scope))
            return

    @staticmethod
    def _fingerprint_message(body: str) -> str:
        import hashlib

        return hashlib.sha256(body.encode("utf-8")).hexdigest()

    @staticmethod
    def _extract_provider_message_id(response: Any) -> str | None:
        if response is None:
            return None
        if isinstance(response, str):
            return response
        if isinstance(response, dict):
            for key in ("id", "message_id", "sid", "provider_message_id"):
                if response.get(key):
                    return str(response[key])
            messages = response.get("messages")
            if isinstance(messages, list):
                for message in messages:
                    if isinstance(message, dict) and message.get("id"):
                        return str(message["id"])
        for key in ("id", "message_id", "sid", "provider_message_id"):
            if hasattr(response, key):
                value = getattr(response, key)
                if value:
                    return str(value)
        return None

    @staticmethod
    def _normalize_response(response: Any) -> dict[str, Any]:
        if response is None:
            return {}
        if isinstance(response, dict):
            return response
        if hasattr(response, "__dict__"):
            return {k: v for k, v in vars(response).items() if not k.startswith("_")}
        return {"value": response}


__all__ = ["WhatsAppRecipient", "WhatsAppSendResult", "WhatsAppService"]
