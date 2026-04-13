"""Outbound WhatsApp messaging for scheduled check-ins."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
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
    provider_message_id: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class WhatsAppService:
    """Encapsulates message generation, delivery, and send-log updates."""

    whatsapp_client: WhatsAppClientProtocol
    supabase_client: SupabaseClientProtocol | None = None
    send_log_table: str = "checkin_send_logs"

    async def send_text_message(
        self,
        recipient: WhatsAppRecipient,
        body: str,
        **kwargs: Any,
    ) -> WhatsAppSendResult:
        """Send an arbitrary WhatsApp text message through the provider client."""

        provider_response = await self.whatsapp_client.send_message(
            to=recipient.phone_number,
            body=body,
            **kwargs,
        )
        return WhatsAppSendResult(
            recipient=recipient,
            body=body,
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
            return WhatsAppSendResult(recipient=recipient, body=body, provider_message_id=send_log.provider_message_id)

        provider_response = await self.whatsapp_client.send_message(
            to=recipient.phone_number,
            body=body,
            athlete_id=recipient.athlete_id,
            scheduled_for=scheduled_for.isoformat(),
            dedupe_key=send_log.dedupe_key,
        )

        provider_message_id = self._extract_provider_message_id(provider_response)
        await self._mark_send_log_sent(send_log, provider_message_id=provider_message_id)
        return WhatsAppSendResult(
            recipient=recipient,
            body=body,
            provider_message_id=provider_message_id,
            raw=self._normalize_response(provider_response),
        )

    async def _mark_send_log_sent(
        self,
        send_log: CheckinSendLog,
        *,
        provider_message_id: str | None,
    ) -> None:
        if self.supabase_client is None:
            return

        table = await self.supabase_client.table(self.send_log_table)
        payload = {
            "status": "sent",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "provider_message_id": provider_message_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if hasattr(table, "update") and hasattr(table, "eq"):
            updater = table.update(payload).eq("dedupe_key", send_log.dedupe_key)
            if hasattr(updater, "execute"):
                await updater.execute()
            else:
                await updater
            return

        if hasattr(table, "upsert"):
            await table.upsert({**send_log.to_row(), **payload})
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
