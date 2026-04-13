"""Coach triage and verification workflow helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from app.services.predictive_analysis import PredictiveAnalysisService
from app.services.scope import DataScope, apply_scope_payload, apply_scope_query, require_scope
from app.services.whatsapp_service import WhatsAppRecipient, WhatsAppService

CoachDecision = Literal["Approve", "Edit", "Ignore"]


@dataclass(slots=True)
class CoachContact:
    athlete_id: str
    phone_number: str | None = None
    timezone_name: str = "UTC"
    display_name: str | None = None


@dataclass(slots=True)
class CoachTriageItem:
    athlete_id: str
    athlete_name: str | None
    urgency_score: float
    urgency_label: str
    latest_memory_state_id: str | None
    latest_memory_state_at: str | None
    hrv_flag: str | None
    soreness_score: float | None
    missed_workouts: int
    reasons: list[str] = field(default_factory=list)
    predicted_state_summary: str | None = None
    predicted_state_flags: list[Any] = field(default_factory=list)
    memory_state: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class CoachVerifyResult:
    suggestion_id: str
    decision: CoachDecision
    status: str
    athlete_id: str | None
    athlete_name: str | None
    confirmation_sent: bool = False
    confirmation_message_id: str | None = None
    confirmation_error: str | None = None
    suggestion: dict[str, Any] = field(default_factory=dict)


class CoachWorkflow:
    """Encapsulates memory-state triage and suggestion verification updates."""

    def __init__(
        self,
        supabase_client: Any,
        whatsapp_service: WhatsAppService | None = None,
        *,
        memory_states_table: str = "memory_states",
        suggestions_table: str = "suggestions",
        athletes_table: str = "athletes",
        scope: DataScope | None = None,
        predictive_analysis_service: PredictiveAnalysisService | None = None,
    ) -> None:
        self.supabase_client = supabase_client
        self.whatsapp_service = whatsapp_service
        self.memory_states_table = memory_states_table
        self.suggestions_table = suggestions_table
        self.athletes_table = athletes_table
        self.scope = scope
        self.predictive_analysis_service = predictive_analysis_service

    async def build_triage(self) -> list[CoachTriageItem]:
        scope = require_scope(self.scope, context="Coach triage")
        table = await self.supabase_client.table(self.memory_states_table)
        rows = await _query_rows(apply_scope_query(_select_all(table), scope))
        latest_by_athlete: dict[str, dict[str, Any]] = {}
        athlete_history: dict[str, list[dict[str, Any]]] = {}

        for row in rows:
            athlete_id = _string_value(row.get("athlete_id") or row.get("athleteId") or row.get("user_id") or row.get("userId"))
            if not athlete_id:
                continue

            athlete_history.setdefault(athlete_id, []).append(row)

            row_timestamp = _row_datetime(row, ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day"))
            current = latest_by_athlete.get(athlete_id)
            if current is None:
                latest_by_athlete[athlete_id] = row
                continue

            current_timestamp = _row_datetime(current, ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day"))
            if row_timestamp >= current_timestamp:
                latest_by_athlete[athlete_id] = row

        triage_items: list[CoachTriageItem] = []
        for athlete_id, row in latest_by_athlete.items():
            predicted_state = None
            history_rows = athlete_history.get(athlete_id, [])
            if self.predictive_analysis_service is not None or history_rows:
                service = self.predictive_analysis_service or PredictiveAnalysisService(
                    self.supabase_client,
                    memory_states_table=self.memory_states_table,
                    scope=self.scope,
                )
                predicted_state = await service.analyze_athlete(athlete_id, history_rows, now=None)
            triage_items.append(self._build_triage_item(athlete_id, row, predicted_state=predicted_state))

        triage_items.sort(key=lambda item: (-item.urgency_score, item.athlete_name or item.athlete_id))
        return triage_items

    async def verify_suggestion(
        self,
        suggestion_id: str,
        decision: CoachDecision,
        *,
        coach_notes: str | None = None,
        edited_adjustment: dict[str, Any] | str | None = None,
        send_confirmation: bool = True,
    ) -> CoachVerifyResult:
        scope = require_scope(self.scope, context="Coach verification")
        suggestions_table = await self.supabase_client.table(self.suggestions_table)
        suggestion = await self._fetch_by_id(suggestions_table, suggestion_id, scope=scope)
        if suggestion is None:
            raise LookupError(f"Suggestion {suggestion_id} was not found")

        athlete_id = _string_value(suggestion.get("athlete_id") or suggestion.get("athleteId"))
        athlete_name = _string_value(
            suggestion.get("athlete_display_name")
            or suggestion.get("athlete_name")
            or suggestion.get("display_name")
            or suggestion.get("name")
        )
        now = datetime.now(timezone.utc)
        status = _decision_to_status(decision)
        update_payload: dict[str, Any] = {
            "status": status,
            "coach_decision": decision,
            "coach_notes": coach_notes,
            "verified_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }

        if decision == "Edit":
            if isinstance(edited_adjustment, dict):
                update_payload["coach_edited_payload"] = edited_adjustment
            elif edited_adjustment is not None:
                update_payload["coach_edited_payload"] = {"edited_adjustment": edited_adjustment}

        await self._update_by_id(suggestions_table, suggestion_id, update_payload, scope=scope)
        suggestion.update(update_payload)

        result = CoachVerifyResult(
            suggestion_id=suggestion_id,
            decision=decision,
            status=status,
            athlete_id=athlete_id,
            athlete_name=athlete_name,
            suggestion=suggestion,
        )

        if decision == "Approve" and send_confirmation:
            contact = await self._resolve_athlete_contact(athlete_id=athlete_id, suggestion=suggestion, scope=scope)
            if contact is not None and contact.phone_number and self.whatsapp_service is not None:
                recipient = WhatsAppRecipient(
                    athlete_id=contact.athlete_id,
                    phone_number=contact.phone_number,
                    timezone_name=contact.timezone_name,
                    display_name=contact.display_name,
                )
                confirmation_body = self._build_confirmation_message(recipient, suggestion)
                try:
                    send_result = await self.whatsapp_service.send_text_message(
                        recipient,
                        confirmation_body,
                        source="coach_verification",
                        suggestion_id=suggestion_id,
                        decision=decision,
                    )
                    confirmation_update = {
                        "confirmation_sent_at": now.isoformat(),
                        "confirmation_message_id": send_result.provider_message_id,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await self._update_by_id(suggestions_table, suggestion_id, confirmation_update, scope=scope)
                    suggestion.update(confirmation_update)
                    result.confirmation_sent = True
                    result.confirmation_message_id = send_result.provider_message_id
                except Exception as exc:  # pragma: no cover - downstream transport failure
                    error_update = {
                        "confirmation_error": str(exc),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await self._update_by_id(suggestions_table, suggestion_id, error_update, scope=scope)
                    suggestion.update(error_update)
                    result.confirmation_error = str(exc)

        result.suggestion = suggestion
        return result

    async def _resolve_athlete_contact(self, *, athlete_id: str | None, suggestion: dict[str, Any], scope: DataScope | None) -> CoachContact | None:
        suggested_phone = _string_value(
            suggestion.get("athlete_phone_number")
            or suggestion.get("phone_number")
            or suggestion.get("whatsapp_number")
            or suggestion.get("phone")
        )
        suggested_timezone = _string_value(suggestion.get("athlete_timezone_name") or suggestion.get("timezone_name") or suggestion.get("timezone")) or "UTC"
        suggested_name = _string_value(suggestion.get("athlete_display_name") or suggestion.get("athlete_name") or suggestion.get("display_name") or suggestion.get("name"))

        if suggested_phone:
            return CoachContact(
                athlete_id=athlete_id or _string_value(suggestion.get("athlete_id") or suggestion.get("athleteId")) or "",
                phone_number=suggested_phone,
                timezone_name=suggested_timezone,
                display_name=suggested_name,
            )

        if not athlete_id:
            return None

        table = await self.supabase_client.table(self.athletes_table)
        rows = await _query_rows(apply_scope_query(_select_all(table).eq("id", athlete_id) if hasattr(_select_all(table), "eq") else _select_all(table), scope))
        if not rows and hasattr(table, "select"):
            rows = await _query_rows(apply_scope_query(table.select("*"), scope))

        for row in rows:
            row_athlete_id = _string_value(row.get("id") or row.get("athlete_id") or row.get("athleteId"))
            if row_athlete_id and athlete_id and row_athlete_id != athlete_id:
                continue
            phone_number = _string_value(row.get("phone_number") or row.get("whatsapp_number") or row.get("phone"))
            if phone_number:
                return CoachContact(
                    athlete_id=row_athlete_id or athlete_id,
                    phone_number=phone_number,
                    timezone_name=_string_value(row.get("timezone_name") or row.get("timezone")) or "UTC",
                    display_name=_string_value(row.get("display_name") or row.get("name")),
                )

        return None

    async def _fetch_by_id(self, table: Any, row_id: str, *, scope: DataScope | None) -> dict[str, Any] | None:
        scoped_table = apply_scope_query(table.select("*").eq("id", row_id) if hasattr(table, "select") and hasattr(table, "eq") else table, scope)
        rows = await _query_rows(scoped_table)
        if rows:
            for row in rows:
                if _string_value(row.get("id")) == row_id:
                    return row
        if hasattr(table, "select"):
            rows = await _query_rows(apply_scope_query(table.select("*"), scope))
            for row in rows:
                if _string_value(row.get("id")) == row_id:
                    return row
        return None

    async def _update_by_id(self, table: Any, row_id: str, payload: dict[str, Any], *, scope: DataScope | None) -> None:
        scoped_payload = apply_scope_payload({"id": row_id, **payload}, scope)
        if hasattr(table, "update") and hasattr(table, "eq"):
            updater = table.update(scoped_payload).eq("id", row_id)
            if scope is not None:
                updater = apply_scope_query(updater, scope)
            if hasattr(updater, "execute"):
                await updater.execute()
            else:
                await updater
            return

        if hasattr(table, "upsert"):
            await table.upsert(scoped_payload)
            return

        raise RuntimeError("Supabase table does not support update operations")

    def _build_triage_item(self, athlete_id: str, row: dict[str, Any], *, predicted_state: Any | None = None) -> CoachTriageItem:
        athlete_name = _string_value(row.get("athlete_display_name") or row.get("athlete_name") or row.get("display_name") or row.get("name"))
        hrv_flag = _string_value(
            row.get("hrv_flag")
            or row.get("hrv_status")
            or row.get("hrv_state")
            or row.get("hrv_alert")
            or row.get("hrv_trend")
        )
        soreness_value = _pick_value(row, ("soreness", "soreness_score", "muscle_soreness", "recovery_soreness"))
        missed_workouts_value = _pick_value(row, ("missed_workouts", "missed_workout_count", "missed_sessions", "missed_sessions_count"))

        hrv_score, hrv_reason = _score_hrv_flag(hrv_flag)
        soreness_score, soreness_reason = _score_soreness(soreness_value)
        missed_score, missed_reason = _score_missed_workouts(missed_workouts_value)

        urgency_score = min(100.0, hrv_score + soreness_score + missed_score)
        reasons = [reason for reason in (hrv_reason, soreness_reason, missed_reason) if reason]
        predicted_state_flags: list[Any] = []
        predicted_state_summary: str | None = None
        if predicted_state is not None:
            predicted_state_flags = [flag for flag in getattr(predicted_state, "flags", [])]
            predicted_state_summary = getattr(predicted_state, "summary", None)
            if predicted_state_flags:
                urgency_score = min(100.0, urgency_score + max(getattr(flag, "score", 0.0) for flag in predicted_state_flags) * 0.3)
                reasons.extend(_predicted_reasons(predicted_state_flags))

        urgency_label = _urgency_label(urgency_score)
        latest_at = _row_datetime(row, ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day"))

        return CoachTriageItem(
            athlete_id=athlete_id,
            athlete_name=athlete_name,
            urgency_score=urgency_score,
            urgency_label=urgency_label,
            latest_memory_state_id=_string_value(row.get("id") or row.get("memory_state_id")),
            latest_memory_state_at=(latest_at.isoformat() if latest_at != datetime.min.replace(tzinfo=timezone.utc) else None),
            hrv_flag=hrv_flag,
            soreness_score=_float_or_none(soreness_value),
            missed_workouts=_int_or_zero(missed_workouts_value),
            reasons=reasons,
            predicted_state_summary=predicted_state_summary,
            predicted_state_flags=predicted_state_flags,
            memory_state=_clean_row(row),
        )

    @staticmethod
    def _build_confirmation_message(recipient: WhatsAppRecipient, suggestion: dict[str, Any]) -> str:
        summary = (
            _string_value(suggestion.get("suggestion_text"))
            or _string_value(suggestion.get("summary"))
            or _string_value(suggestion.get("message"))
            or "a plan update"
        )
        greeting = recipient.display_name or "there"
        return (
            f"Hi {greeting}, your coach approved {summary}. "
            "You should see the updated plan reflected soon."
        )


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


def _select_all(table: Any) -> Any:
    return table.select("*") if hasattr(table, "select") else table


def _clean_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if value is not None}


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _pick_value(row: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _row_datetime(row: dict[str, Any], keys: tuple[str, ...]) -> datetime:
    for key in keys:
        value = row.get(key)
        parsed = _parse_datetime(value)
        if parsed is not None:
            return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


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


def _score_hrv_flag(value: Any) -> tuple[float, str | None]:
    text = _string_value(value)
    if text is None:
        return 0.0, None
    normalized = text.lower()
    if normalized in {"critical", "severe", "bad", "low", "red", "alert", "flagged", "true", "yes", "1", "abnormal", "warning"}:
        return 40.0, f"HRV flag indicates {normalized}"
    if normalized in {"moderate", "yellow", "watch", "caution", "elevated"}:
        return 20.0, f"HRV flag indicates {normalized}"
    return 0.0, None


def _score_soreness(value: Any) -> tuple[float, str | None]:
    number = _float_or_none(value)
    if number is not None:
        normalized = max(0.0, min(10.0, number))
        score = normalized * 3.0
        if score <= 0:
            return 0.0, None
        return score, f"Soreness score {number:g}"

    text = _string_value(value)
    if text is None:
        return 0.0, None
    normalized = text.lower()
    if normalized in {"severe", "high", "very high", "extreme"}:
        return 18.0, f"Soreness is {normalized}"
    if normalized in {"moderate", "medium"}:
        return 10.0, f"Soreness is {normalized}"
    if normalized in {"mild", "low"}:
        return 4.0, f"Soreness is {normalized}"
    return 0.0, None


def _predicted_reasons(flags: list[Any]) -> list[str]:
    reasons: list[str] = []
    for flag in flags:
        label = getattr(flag, "label", None) or getattr(flag, "code", None)
        reason = getattr(flag, "reason", None)
        if label and reason:
            reasons.append(f"{label}: {reason}")
        elif label:
            reasons.append(str(label))
    return reasons


def _score_missed_workouts(value: Any) -> tuple[float, str | None]:
    if isinstance(value, bool):
        return (20.0 if value else 0.0), ("Missed workout flag is set" if value else None)

    count = _int_or_zero(value)
    if count <= 0:
        return 0.0, None
    score = min(30.0, float(count) * 15.0)
    label = "missed workout" if count == 1 else "missed workouts"
    return score, f"{count} {label}"


def _urgency_label(score: float) -> str:
    if score >= 70:
        return "critical"
    if score >= 45:
        return "high"
    if score >= 20:
        return "medium"
    return "low"


def _decision_to_status(decision: CoachDecision) -> str:
    return {
        "Approve": "approved",
        "Edit": "edited",
        "Ignore": "ignored",
    }[decision]


__all__ = ["CoachWorkflow", "CoachTriageItem", "CoachVerifyResult", "CoachDecision"]
