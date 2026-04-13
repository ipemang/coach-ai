"""Timezone-aware scheduled check-in worker orchestration."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from typing import Any, Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.checkinsend_log import CheckinSendLog
from app.services.scope import DataScope, apply_scope_payload, apply_scope_query, require_scope


class SupabaseClientProtocol(Protocol):
    async def table(self, name: str) -> Any:  # pragma: no cover - runtime adapter
        ...


class TaskQueueProtocol(Protocol):
    async def enqueue(self, task_name: str, payload: dict[str, Any]) -> Any:  # pragma: no cover - runtime adapter
        ...


@dataclass(slots=True)
class CheckinAthlete:
    athlete_id: str
    phone_number: str
    timezone_name: str
    display_name: str | None = None
    enabled: bool = True
    scheduled_time: time = field(default_factory=lambda: time(hour=8, minute=0))
    trigger_window_minutes: int = 30


@dataclass(slots=True)
class CheckinSchedulerConfig:
    athletes_table: str = "athletes"
    send_log_table: str = "checkin_send_logs"
    default_scheduled_time: time = field(default_factory=lambda: time(hour=8, minute=0))
    default_trigger_window_minutes: int = 30
    task_name: str = "send_checkin_whatsapp"
    checkin_link: str | None = None
    organization_id: str | None = None
    coach_id: str | None = None


@dataclass(slots=True)
class EnqueuedCheckinTask:
    athlete_id: str
    phone_number: str
    timezone_name: str
    scheduled_for: datetime
    dedupe_key: str
    task_name: str
    queue_result: Any = None


@dataclass(slots=True)
class CheckinSchedulerResult:
    scanned: int = 0
    due: int = 0
    reserved: int = 0
    skipped: int = 0
    tasks: list[EnqueuedCheckinTask] = field(default_factory=list)


class CheckinScheduler:
    """Finds due athletes, reserves a send slot, and enqueues outbound tasks."""

    def __init__(
        self,
        supabase_client: SupabaseClientProtocol,
        task_queue: TaskQueueProtocol,
        config: CheckinSchedulerConfig | None = None,
        scope: DataScope | None = None,
    ) -> None:
        self.supabase_client = supabase_client
        self.task_queue = task_queue
        self.config = config or CheckinSchedulerConfig()
        self.scope = scope or DataScope(organization_id=self.config.organization_id, coach_id=self.config.coach_id)

    async def run(self, now: datetime | None = None) -> CheckinSchedulerResult:
        now_utc = self._ensure_utc(now or datetime.now(timezone.utc))
        athletes = await self.list_candidate_athletes()
        result = CheckinSchedulerResult(scanned=len(athletes))

        for athlete in athletes:
            if not athlete.enabled:
                result.skipped += 1
                continue

            local_now = now_utc.astimezone(self._get_zoneinfo(athlete.timezone_name))
            scheduled_local = self._scheduled_local_datetime(athlete, local_now)

            if not self._is_due(local_now, scheduled_local, athlete.trigger_window_minutes):
                continue

            due_date = scheduled_local.date()
            send_log = CheckinSendLog(
                athlete_id=athlete.athlete_id,
                scheduled_for=scheduled_local,
                timezone_name=athlete.timezone_name,
                message_fingerprint=self._fingerprint(athlete, due_date),
            )

            reserved = await self._reserve_send_slot(send_log)
            if not reserved:
                result.skipped += 1
                continue

            payload = {
                "athlete_id": athlete.athlete_id,
                "phone_number": athlete.phone_number,
                "display_name": athlete.display_name,
                "timezone_name": athlete.timezone_name,
                "scheduled_for": scheduled_local.isoformat(),
                "dedupe_key": send_log.dedupe_key,
                "checkin_link": self.config.checkin_link,
            }
            queue_result = await self.task_queue.enqueue(self.config.task_name, payload)
            result.due += 1
            result.reserved += 1
            result.tasks.append(
                EnqueuedCheckinTask(
                    athlete_id=athlete.athlete_id,
                    phone_number=athlete.phone_number,
                    timezone_name=athlete.timezone_name,
                    scheduled_for=scheduled_local,
                    dedupe_key=send_log.dedupe_key,
                    task_name=self.config.task_name,
                    queue_result=queue_result,
                )
            )

        return result

    async def list_candidate_athletes(self) -> list[CheckinAthlete]:
        """Load athlete scheduling rows from Supabase and normalize them."""

        scope = require_scope(self.scope, context="Check-in scheduler")
        table = await self.supabase_client.table(self.config.athletes_table)
        query = table.select("*") if hasattr(table, "select") else table
        query = apply_scope_query(query, scope)
        if hasattr(query, "eq"):
            query = query.eq("checkins_enabled", True)
        if hasattr(query, "execute"):
            response = await query.execute()
        elif hasattr(query, "data"):
            response = query
        else:
            response = await query

        rows = self._extract_rows(response)
        athletes: list[CheckinAthlete] = []
        for row in rows:
            timezone_name = str(row.get("timezone_name") or row.get("timezone") or "UTC")
            scheduled_time = self._parse_time(row.get("scheduled_time")) or self.config.default_scheduled_time
            enabled = row.get("checkins_enabled")
            if enabled is None:
                enabled = row.get("enabled", True)
            athletes.append(
                CheckinAthlete(
                    athlete_id=str(row["id"] if "id" in row else row["athlete_id"]),
                    phone_number=str(row.get("phone_number") or row.get("whatsapp_number") or ""),
                    timezone_name=timezone_name,
                    display_name=row.get("display_name") or row.get("name"),
                    enabled=bool(enabled),
                    scheduled_time=scheduled_time,
                    trigger_window_minutes=int(
                        row.get("trigger_window_minutes") or self.config.default_trigger_window_minutes
                    ),
                )
            )
        return athletes

    def should_trigger_for_athlete(self, athlete: CheckinAthlete, now: datetime | None = None) -> bool:
        """Return whether the current moment is inside the athlete's send window."""

        now_utc = self._ensure_utc(now or datetime.now(timezone.utc))
        local_now = now_utc.astimezone(self._get_zoneinfo(athlete.timezone_name))
        scheduled_local = self._scheduled_local_datetime(athlete, local_now)
        return self._is_due(local_now, scheduled_local, athlete.trigger_window_minutes)

    async def _reserve_send_slot(self, send_log: CheckinSendLog) -> bool:
        """Create or reuse a queued log row to prevent duplicate sends."""

        scope = require_scope(self.scope, context="Check-in scheduler send log")
        table = await self.supabase_client.table(self.config.send_log_table)
        existing = None
        if hasattr(table, "select") and hasattr(table, "eq"):
            query = apply_scope_query(table.select("*").eq("dedupe_key", send_log.dedupe_key), scope)
            if hasattr(query, "execute"):
                response = await query.execute()
            else:
                response = await query
            rows = self._extract_rows(response)
            existing = rows[0] if rows else None

        if existing:
            status = str(existing.get("status", "queued"))
            return status not in {"queued", "sent"}

        payload = apply_scope_payload(send_log.to_row(), scope)
        if hasattr(table, "insert"):
            insert_result = table.insert(payload)
            if hasattr(insert_result, "execute"):
                await insert_result.execute()
            else:
                await insert_result
            return True

        if hasattr(table, "upsert"):
            await table.upsert(payload)
            return True

        return False

    @staticmethod
    def _ensure_utc(moment: datetime) -> datetime:
        if moment.tzinfo is None:
            return moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc)

    @staticmethod
    def _get_zoneinfo(timezone_name: str) -> ZoneInfo:
        try:
            return ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:  # pragma: no cover - defensive
            raise ValueError(f"Unknown timezone: {timezone_name}") from exc

    @staticmethod
    def _scheduled_local_datetime(athlete: CheckinAthlete, local_now: datetime) -> datetime:
        return local_now.replace(
            hour=athlete.scheduled_time.hour,
            minute=athlete.scheduled_time.minute,
            second=athlete.scheduled_time.second,
            microsecond=0,
        )

    @staticmethod
    def _is_due(local_now: datetime, scheduled_local: datetime, window_minutes: int) -> bool:
        delta = local_now - scheduled_local
        return delta.total_seconds() >= 0 and delta.total_seconds() < window_minutes * 60

    @staticmethod
    def _parse_time(value: Any) -> time | None:
        if value in (None, ""):
            return None
        if isinstance(value, time):
            return value
        if isinstance(value, str):
            parts = value.split(":")
            if len(parts) < 2:
                return None
            hour = int(parts[0])
            minute = int(parts[1])
            second = int(parts[2]) if len(parts) > 2 else 0
            return time(hour=hour, minute=minute, second=second)
        return None

    @staticmethod
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
            return [response]
        if hasattr(response, "data"):
            data = getattr(response, "data")
            if isinstance(data, list):
                return [row for row in data if isinstance(row, dict)]
            if isinstance(data, dict):
                return [data]
        return []

    @staticmethod
    def _fingerprint(athlete: CheckinAthlete, day: date) -> str:
        import hashlib

        payload = f"{athlete.athlete_id}:{day.isoformat()}:{athlete.scheduled_time.strftime('%H:%M')}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


__all__ = [
    "CheckinAthlete",
    "CheckinScheduler",
    "CheckinSchedulerConfig",
    "CheckinSchedulerResult",
    "EnqueuedCheckinTask",
]
