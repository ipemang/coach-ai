"""Check-in send log model used to prevent duplicate outbound messages."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

CheckinChannel = Literal["whatsapp"]
CheckinSendStatus = Literal["queued", "sent", "failed", "skipped"]


@dataclass(slots=True)
class CheckinSendLog:
    """Normalized row for the check-in send log table.

    The scheduler reserves a send slot with status ``queued`` before enqueueing a
    worker task. The worker updates the row to ``sent`` once the WhatsApp
    provider acknowledges delivery, which makes the operation idempotent.
    """

    athlete_id: str
    scheduled_for: datetime
    timezone_name: str
    channel: CheckinChannel = "whatsapp"
    status: CheckinSendStatus = "queued"
    message_fingerprint: str = ""
    sent_at: datetime | None = None
    provider_message_id: str | None = None
    error_message: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    id: str | None = None

    def __post_init__(self) -> None:
        if self.scheduled_for.tzinfo is None:
            raise ValueError("scheduled_for must be timezone-aware")
        if not self.timezone_name:
            raise ValueError("timezone_name is required")

    @property
    def dedupe_key(self) -> str:
        """Stable key for one send per athlete per local scheduled minute."""

        local_dt = self.scheduled_for.astimezone(ZoneInfo(self.timezone_name))
        return (
            f"{self.athlete_id}:{local_dt.date().isoformat()}:"
            f"{local_dt.strftime('%H:%M')}:{self.channel}:{self.message_fingerprint}"
        )

    def to_row(self) -> dict[str, Any]:
        """Serialize the log entry for persistence."""

        return {
            "id": self.id,
            "athlete_id": self.athlete_id,
            "scheduled_for": self.scheduled_for.isoformat(),
            "timezone_name": self.timezone_name,
            "channel": self.channel,
            "status": self.status,
            "message_fingerprint": self.message_fingerprint,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "provider_message_id": self.provider_message_id,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "dedupe_key": self.dedupe_key,
        }

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "CheckinSendLog":
        """Build a log entry from a database row."""

        def _parse_dt(value: Any) -> datetime | None:
            if value in (None, ""):
                return None
            if isinstance(value, datetime):
                return value
            parsed = datetime.fromisoformat(str(value))
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)

        return cls(
            id=row.get("id"),
            athlete_id=str(row["athlete_id"]),
            scheduled_for=_parse_dt(row["scheduled_for"]) or datetime.now(timezone.utc),
            timezone_name=str(row["timezone_name"]),
            channel=row.get("channel", "whatsapp"),
            status=row.get("status", "queued"),
            message_fingerprint=str(row.get("message_fingerprint", "")),
            sent_at=_parse_dt(row.get("sent_at")),
            provider_message_id=row.get("provider_message_id"),
            error_message=row.get("error_message"),
            created_at=_parse_dt(row.get("created_at")) or datetime.now(timezone.utc),
            updated_at=_parse_dt(row.get("updated_at")) or datetime.now(timezone.utc),
        )


__all__ = ["CheckinSendLog", "CheckinChannel", "CheckinSendStatus"]
