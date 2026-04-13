"""Proactive coach alerting for risky athlete check-ins."""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol

from app.agents.check_in import CheckInRecommendation
from app.services.whatsapp_service import WhatsAppRecipient, WhatsAppService


class SupabaseClientProtocol(Protocol):
    async def table(self, name: str) -> Any:  # pragma: no cover - runtime adapter
        ...


@dataclass(slots=True)
class AlertFinding:
    athlete_id: str
    athlete_name: str | None
    alert_type: str
    severity: str
    summary: str
    reasons: list[str] = field(default_factory=list)
    source_state_id: str | None = None
    source_state_type: str | None = None
    source_timestamp: str | None = None
    check_in: dict[str, Any] = field(default_factory=dict)
    source_row: dict[str, Any] = field(default_factory=dict)
    dedupe_key: str = ""


@dataclass(slots=True)
class CoachRecipient:
    coach_id: str
    phone_number: str
    timezone_name: str = "UTC"
    display_name: str | None = None
    enabled: bool = True


@dataclass(slots=True)
class AlertDispatchResult:
    finding: AlertFinding
    dashboard_written: bool = False
    whatsapp_sent: int = 0
    whatsapp_errors: list[str] = field(default_factory=list)
    notification_rows_written: int = 0


@dataclass(slots=True)
class AlertScanResult:
    scanned: int = 0
    findings: list[AlertFinding] = field(default_factory=list)
    dashboard_written: int = 0
    whatsapp_sent: int = 0
    whatsapp_errors: list[str] = field(default_factory=list)


@dataclass(slots=True)
class AlertServiceConfig:
    checkins_table: str = "memory_states"
    dashboard_alerts_table: str = "coach_alerts"
    notification_log_table: str = "coach_alert_notifications"
    coaches_table: str = "coaches"
    checkin_state_types: tuple[str, ...] = ("athlete_check_in", "check_in")
    low_hrv_ms_threshold: float = 50.0
    high_soreness_threshold: float = 7.0
    missed_workouts_threshold: int = 1
    default_timezone: str = "UTC"
    enable_dashboard_writes: bool = True
    enable_whatsapp: bool = True


class AlertService:
    """Scan check-in data for red flags and notify coaches."""

    def __init__(
        self,
        supabase_client: SupabaseClientProtocol | None = None,
        whatsapp_service: WhatsAppService | None = None,
        config: AlertServiceConfig | None = None,
    ) -> None:
        self.supabase_client = supabase_client
        self.whatsapp_service = whatsapp_service
        self.config = config or AlertServiceConfig()

    async def run(self, now: datetime | None = None) -> AlertScanResult:
        """Scan stored check-in rows and dispatch alerts for the latest data."""

        rows = await self._load_checkin_rows()
        latest_rows = self._latest_rows_by_athlete(rows)
        findings = [finding for row in latest_rows.values() if (finding := self._build_finding(row, now=now)) is not None]

        result = AlertScanResult(scanned=len(rows), findings=findings)
        for finding in findings:
            dispatch_result = await self._dispatch_finding(finding, now=now)
            result.dashboard_written += 1 if dispatch_result.dashboard_written else 0
            result.whatsapp_sent += dispatch_result.whatsapp_sent
            result.whatsapp_errors.extend(dispatch_result.whatsapp_errors)

        return result

    async def process_check_in_submission(
        self,
        check_in: Any,
        recommendation: CheckInRecommendation | None = None,
        *,
        now: datetime | None = None,
    ) -> AlertScanResult:
        """Evaluate a new check-in payload immediately after submission."""

        row = self._submission_to_row(check_in, recommendation=recommendation, now=now)
        finding = self._build_finding(row, now=now)
        if finding is None:
            return AlertScanResult(scanned=1, findings=[])

        dispatch_result = await self._dispatch_finding(finding, now=now)
        return AlertScanResult(
            scanned=1,
            findings=[finding],
            dashboard_written=1 if dispatch_result.dashboard_written else 0,
            whatsapp_sent=dispatch_result.whatsapp_sent,
            whatsapp_errors=dispatch_result.whatsapp_errors,
        )

    async def _load_checkin_rows(self) -> list[dict[str, Any]]:
        if self.supabase_client is None:
            return []

        table = await self.supabase_client.table(self.config.checkins_table)
        query = table.select("*") if hasattr(table, "select") else table
        if hasattr(query, "in_"):
            try:
                query = query.in_("state_type", list(self.config.checkin_state_types))
            except Exception:
                pass
        rows = await _query_rows(query)
        if not rows and hasattr(table, "select"):
            rows = await _query_rows(table.select("*"))
        return rows

    def _latest_rows_by_athlete(self, rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            athlete_id = _string_value(
                row.get("athlete_id")
                or row.get("athleteId")
                or row.get("user_id")
                or row.get("userId")
            )
            if not athlete_id:
                continue

            if self.config.checkin_state_types:
                state_type = _string_value(row.get("state_type") or row.get("type") or row.get("category"))
                if state_type and state_type not in self.config.checkin_state_types:
                    payload_check_in = _extract_check_in(row)
                    if not payload_check_in:
                        continue

            current = latest.get(athlete_id)
            if current is None or _row_datetime(row) >= _row_datetime(current):
                latest[athlete_id] = row
        return latest

    def _build_finding(self, row: dict[str, Any], *, now: datetime | None = None) -> AlertFinding | None:
        athlete_id = _string_value(
            row.get("athlete_id")
            or row.get("athleteId")
            or row.get("user_id")
            or row.get("userId")
        )
        if not athlete_id:
            return None

        check_in = _extract_check_in(row)
        athlete_name = _string_value(
            row.get("athlete_display_name")
            or row.get("athlete_name")
            or row.get("display_name")
            or row.get("name")
        )
        source_state_id = _string_value(row.get("id") or row.get("memory_state_id") or row.get("memoryStateId"))
        source_state_type = _string_value(row.get("state_type") or row.get("type") or row.get("category"))
        source_timestamp = _row_timestamp(row)

        flags: list[str] = []
        red_flag_sources: list[str] = []

        hrv_text = _string_value(
            check_in.get("hrv")
            or row.get("hrv")
            or row.get("hrv_flag")
            or row.get("hrv_status")
            or row.get("hrv_state")
            or row.get("hrv_alert")
            or row.get("hrv_trend")
        )
        hrv_ms = _float_or_none(check_in.get("hrv_ms") or row.get("hrv_ms"))
        soreness = _float_or_none(check_in.get("soreness") or row.get("soreness") or row.get("soreness_score"))
        missed_workouts = _int_or_zero(
            check_in.get("missed_workouts")
            or row.get("missed_workouts")
            or row.get("missed_workout_count")
            or row.get("missed_sessions")
            or row.get("missed_sessions_count")
        )

        if _is_low_hrv(hrv_text, hrv_ms, threshold=self.config.low_hrv_ms_threshold):
            flags.append("low HRV")
            red_flag_sources.append("hrv")

        if soreness is not None and soreness >= self.config.high_soreness_threshold:
            flags.append(f"soreness {soreness:g}/10")
            red_flag_sources.append("soreness")

        if missed_workouts >= self.config.missed_workouts_threshold:
            label = "missed workout" if missed_workouts == 1 else "missed workouts"
            flags.append(f"{missed_workouts} {label}")
            red_flag_sources.append("missed_workouts")

        if not flags:
            return None

        severity = _severity_for_flags(red_flag_sources, missed_workouts=missed_workouts, soreness=soreness, low_hrv=hrv_text is not None or hrv_ms is not None)
        summary = _build_summary(athlete_name=athlete_name, flags=flags, recommendation=row.get("recommended_action") or check_in.get("recommended_action"))
        reasons = _build_reasons(hrv_text=hrv_text, hrv_ms=hrv_ms, soreness=soreness, missed_workouts=missed_workouts, recommendation=row.get("rationale") or check_in.get("rationale"))
        dedupe_key = _build_dedupe_key(athlete_id=athlete_id, source_state_id=source_state_id, flags=flags, source_timestamp=source_timestamp)

        return AlertFinding(
            athlete_id=athlete_id,
            athlete_name=athlete_name,
            alert_type="check_in_red_flag",
            severity=severity,
            summary=summary,
            reasons=reasons,
            source_state_id=source_state_id,
            source_state_type=source_state_type,
            source_timestamp=source_timestamp,
            check_in=check_in,
            source_row=_clean_row(row),
            dedupe_key=dedupe_key,
        )

    def _submission_to_row(
        self,
        check_in: Any,
        *,
        recommendation: CheckInRecommendation | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        if hasattr(check_in, "model_dump"):
            payload = check_in.model_dump()
        elif isinstance(check_in, dict):
            payload = dict(check_in)
        else:
            payload = {key: getattr(check_in, key) for key in dir(check_in) if not key.startswith("_") and not callable(getattr(check_in, key))}

        row = {
            "athlete_id": payload.get("athlete_id") or payload.get("athleteId"),
            "athlete_display_name": payload.get("athlete_display_name") or payload.get("athlete_name") or payload.get("display_name") or payload.get("name"),
            "state_type": "athlete_check_in",
            "created_at": (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(),
            "updated_at": (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(),
            "check_in": payload,
        }

        if recommendation is not None:
            row["recommended_action"] = recommendation.recommended_action
            row["rationale"] = recommendation.rationale

        return row

    async def _dispatch_finding(self, finding: AlertFinding, *, now: datetime | None = None) -> AlertDispatchResult:
        dashboard_written = await self._write_dashboard_alert(finding, now=now)
        whatsapp_sent = 0
        whatsapp_errors: list[str] = []
        notification_rows_written = 0

        if self.whatsapp_service is not None and self.config.enable_whatsapp:
            coaches = await self._load_coach_recipients()
            for coach in coaches:
                if not coach.enabled or not coach.phone_number:
                    continue
                recipient = WhatsAppRecipient(
                    athlete_id=coach.coach_id,
                    phone_number=coach.phone_number,
                    timezone_name=coach.timezone_name or self.config.default_timezone,
                    display_name=coach.display_name,
                )
                body = self._build_whatsapp_message(coach=coach, finding=finding)
                provider_message_id: str | None = None
                status = "dashboard_only"
                error_message: str | None = None
                try:
                    send_result = await self.whatsapp_service.send_text_message(
                        recipient,
                        body,
                        source="coach_alert",
                        alert_type=finding.alert_type,
                        athlete_id=finding.athlete_id,
                        dedupe_key=finding.dedupe_key,
                        summary=finding.summary,
                    )
                    provider_message_id = send_result.provider_message_id
                    if send_result.delivered:
                        whatsapp_sent += 1
                        status = "sent"
                    else:
                        error_message = send_result.error_message or "WhatsApp delivery failed"
                        whatsapp_errors.append(error_message)
                        status = "failed"
                except Exception as exc:  # pragma: no cover - downstream transport failure
                    error_message = str(exc)
                    whatsapp_errors.append(error_message)
                    status = "failed"

                if await self._write_notification_log_for_recipient(
                    finding,
                    coach=coach,
                    now=now,
                    status=status,
                    provider_message_id=provider_message_id,
                    error_message=error_message,
                ):
                    notification_rows_written += 1

        return AlertDispatchResult(
            finding=finding,
            dashboard_written=dashboard_written,
            whatsapp_sent=whatsapp_sent,
            whatsapp_errors=whatsapp_errors,
            notification_rows_written=notification_rows_written,
        )

    async def _load_coach_recipients(self) -> list[CoachRecipient]:
        if self.supabase_client is None:
            return []

        table = await self.supabase_client.table(self.config.coaches_table)
        query = table.select("*") if hasattr(table, "select") else table
        rows = await _query_rows(query)
        if not rows and hasattr(table, "select"):
            rows = await _query_rows(table.select("*"))

        recipients: list[CoachRecipient] = []
        for row in rows:
            phone = _string_value(row.get("phone_number") or row.get("whatsapp_number") or row.get("phone"))
            if not phone:
                continue
            coach_id = _string_value(row.get("coach_id") or row.get("id") or row.get("coachId"))
            if not coach_id:
                continue
            enabled = row.get("alerts_enabled")
            if enabled is None:
                enabled = row.get("notifications_enabled")
            if enabled is None:
                enabled = row.get("enabled", True)
            recipients.append(
                CoachRecipient(
                    coach_id=coach_id,
                    phone_number=phone,
                    timezone_name=_string_value(row.get("timezone_name") or row.get("timezone")) or self.config.default_timezone,
                    display_name=_string_value(row.get("display_name") or row.get("name")),
                    enabled=bool(enabled),
                )
            )
        return recipients

    async def _write_dashboard_alert(self, finding: AlertFinding, *, now: datetime | None = None) -> bool:
        if self.supabase_client is None or not self.config.enable_dashboard_writes:
            return False

        table = await self.supabase_client.table(self.config.dashboard_alerts_table)
        payload = self._dashboard_payload(finding, now=now)
        if not await self._ensure_not_duplicate(table, finding.dedupe_key, dedupe_field="dedupe_key"):
            return False
        return await _write_row(table, payload)

    async def _write_notification_log_for_recipient(
        self,
        finding: AlertFinding,
        *,
        coach: CoachRecipient,
        now: datetime | None = None,
        status: str,
        provider_message_id: str | None = None,
        error_message: str | None = None,
    ) -> bool:
        if self.supabase_client is None:
            return False

        table = await self.supabase_client.table(self.config.notification_log_table)
        dedupe_key = f"{finding.dedupe_key}:{coach.coach_id}"
        if not await self._ensure_not_duplicate(table, dedupe_key, dedupe_field="dedupe_key"):
            return False
        payload = {
            "dedupe_key": dedupe_key,
            "coach_id": coach.coach_id,
            "coach_phone_number": coach.phone_number,
            "coach_display_name": coach.display_name,
            "athlete_id": finding.athlete_id,
            "alert_type": finding.alert_type,
            "status": status,
            "provider_message_id": provider_message_id,
            "error_message": error_message,
            "created_at": (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(),
            "updated_at": (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(),
        }
        return await _write_row(table, payload)

    async def _ensure_not_duplicate(self, table: Any, dedupe_key: str, *, dedupe_field: str) -> bool:
        if not hasattr(table, "select") or not hasattr(table, "eq"):
            return True
        try:
            query = table.select("*").eq(dedupe_field, dedupe_key)
            rows = await _query_rows(query)
        except Exception:
            return True
        return not rows

    @staticmethod
    def _dashboard_payload(finding: AlertFinding, *, now: datetime | None = None) -> dict[str, Any]:
        ts = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()
        return {
            "dedupe_key": finding.dedupe_key,
            "athlete_id": finding.athlete_id,
            "athlete_name": finding.athlete_name,
            "alert_type": finding.alert_type,
            "severity": finding.severity,
            "summary": finding.summary,
            "reasons": finding.reasons,
            "source_state_id": finding.source_state_id,
            "source_state_type": finding.source_state_type,
            "source_timestamp": finding.source_timestamp,
            "check_in": finding.check_in,
            "source_row": finding.source_row,
            "status": "open",
            "created_at": ts,
            "updated_at": ts,
        }

    @staticmethod
    def _build_whatsapp_message(*, coach: CoachRecipient, finding: AlertFinding) -> str:
        greeting = coach.display_name or "coach"
        athlete = finding.athlete_name or finding.athlete_id
        reasons = ", ".join(finding.reasons[:3])
        return (
            f"Hi {greeting}, proactive alert for {athlete}: {finding.summary}. "
            f"Reasons: {reasons}. Review the dashboard for details."
        )


def _build_summary(*, athlete_name: str | None, flags: list[str], recommendation: Any | None = None) -> str:
    subject = athlete_name or "Athlete"
    summary = f"{subject} has check-in red flags: {', '.join(flags)}."
    if recommendation:
        summary = f"{summary} Suggested action: {recommendation}."
    return summary


def _build_reasons(*, hrv_text: str | None, hrv_ms: float | None, soreness: float | None, missed_workouts: int, recommendation: str | None = None) -> list[str]:
    reasons: list[str] = []
    if hrv_text is not None:
        reasons.append(f"HRV marked {hrv_text}")
    elif hrv_ms is not None:
        reasons.append(f"HRV is {hrv_ms:g} ms")
    if soreness is not None:
        reasons.append(f"Soreness is {soreness:g}/10")
    if missed_workouts > 0:
        label = "missed workout" if missed_workouts == 1 else "missed workouts"
        reasons.append(f"{missed_workouts} {label}")
    if recommendation:
        reasons.append(recommendation)
    return reasons


def _severity_for_flags(
    flags: list[str],
    *,
    missed_workouts: int,
    soreness: float | None,
    low_hrv: bool,
) -> str:
    score = 0
    if low_hrv:
        score += 1
    if soreness is not None and soreness >= 8:
        score += 2
    elif soreness is not None and soreness >= 7:
        score += 1
    score += min(2, missed_workouts)
    score += len(flags)
    if score >= 5:
        return "critical"
    if score >= 3:
        return "high"
    if score >= 1:
        return "medium"
    return "low"


def _is_low_hrv(hrv_text: str | None, hrv_ms: float | None, *, threshold: float) -> bool:
    if hrv_text is not None:
        normalized = hrv_text.strip().lower()
        if normalized in {"below", "low", "red", "alert", "abnormal", "poor", "warning", "true", "yes", "1"}:
            return True
    if hrv_ms is not None:
        return hrv_ms <= threshold
    return False


def _build_dedupe_key(*, athlete_id: str, source_state_id: str | None, flags: list[str], source_timestamp: str | None) -> str:
    import hashlib

    payload = f"{athlete_id}:{source_state_id or ''}:{source_timestamp or ''}:{'|'.join(flags)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _query_rows(query: Any) -> list[dict[str, Any]]:
    if hasattr(query, "execute"):
        response = await query.execute()
    elif hasattr(query, "__await__"):
        response = await query
    else:
        response = query
    return _extract_rows(response)


async def _write_row(table: Any, payload: dict[str, Any]) -> bool:
    if hasattr(table, "insert"):
        result = table.insert(payload)
        if hasattr(result, "execute"):
            await result.execute()
        else:
            await result
        return True
    if hasattr(table, "upsert"):
        result = table.upsert(payload)
        if hasattr(result, "execute"):
            await result.execute()
        else:
            await result
        return True
    return False


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


def _clean_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if value is not None}


def _extract_check_in(row: dict[str, Any]) -> dict[str, Any]:
    for key in ("check_in", "payload", "memory_state", "details"):
        value = row.get(key)
        if isinstance(value, dict):
            if key == "check_in":
                return value
            nested = value.get("check_in")
            if isinstance(nested, dict):
                return nested
    return {}


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int_or_zero(value: Any) -> int:
    if value in (None, ""):
        return 0
    if isinstance(value, bool):
        return int(value)
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _row_datetime(row: dict[str, Any]) -> datetime:
    for key in ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day", "state_date"):
        value = row.get(key)
        parsed = _parse_datetime(value)
        if parsed is not None:
            return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


def _row_timestamp(row: dict[str, Any]) -> str | None:
    timestamp = _row_datetime(row)
    if timestamp == datetime.min.replace(tzinfo=timezone.utc):
        return None
    return timestamp.isoformat()


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


__all__ = [
    "AlertDispatchResult",
    "AlertFinding",
    "AlertScanResult",
    "AlertService",
    "AlertServiceConfig",
    "CoachRecipient",
]
