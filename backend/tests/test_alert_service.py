from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.agents.check_in import AthleteCheckIn, CheckInRecommendation, assess_check_in
from app.services.alert_service import AlertService


class FakeQuery:
    def __init__(self, rows: list[dict[str, Any]], table: "FakeTable") -> None:
        self._rows = rows
        self._table = table
        self._eq_filters: list[tuple[str, Any]] = []
        self._in_filters: list[tuple[str, list[Any]]] = []

    def select(self, *_args: Any, **_kwargs: Any) -> "FakeQuery":
        return self

    def eq(self, field: str, value: Any) -> "FakeQuery":
        self._eq_filters.append((field, value))
        return self

    def in_(self, field: str, values: list[Any]) -> "FakeQuery":
        self._in_filters.append((field, values))
        return self

    async def execute(self) -> dict[str, Any]:
        rows = list(self._rows)
        for field, value in self._eq_filters:
            rows = [row for row in rows if row.get(field) == value]
        for field, values in self._in_filters:
            rows = [row for row in rows if row.get(field) in values]
        return {"data": rows}


class FakeTable:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.inserted: list[dict[str, Any]] = []

    def select(self, *_args: Any, **_kwargs: Any) -> FakeQuery:
        return FakeQuery(self.rows + self.inserted, self)

    def insert(self, payload: dict[str, Any]) -> Any:
        self.inserted.append(payload)

        class _Result:
            async def execute(self_nonlocal) -> dict[str, Any]:
                return {"data": [payload]}

        return _Result()

    def upsert(self, payload: dict[str, Any]) -> Any:
        self.inserted.append(payload)

        class _Result:
            async def execute(self_nonlocal) -> dict[str, Any]:
                return {"data": [payload]}

        return _Result()


class FakeSupabaseClient:
    def __init__(self, tables: dict[str, FakeTable]) -> None:
        self.tables = tables

    async def table(self, name: str) -> FakeTable:
        if name not in self.tables:
            self.tables[name] = FakeTable([])
        return self.tables[name]


@dataclass
class FakeSendResult:
    provider_message_id: str | None = "msg-123"
    delivered: bool = True
    error_message: str | None = None


class FakeWhatsAppService:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_text_message(self, recipient, body: str, **kwargs: Any) -> FakeSendResult:
        self.sent.append({"recipient": recipient, "body": body, "kwargs": kwargs})
        return FakeSendResult()


async def test_process_check_in_submission_persists_dashboard_alert_and_whatsapp_message() -> None:
    tables = {
        "coaches": FakeTable(
            [
                {
                    "coach_id": "coach-1",
                    "display_name": "Alex",
                    "phone_number": "+15550001111",
                    "alerts_enabled": True,
                    "timezone_name": "UTC",
                }
            ]
        ),
        "coach_alerts": FakeTable([]),
        "coach_alert_notifications": FakeTable([]),
    }
    service = AlertService(
        supabase_client=FakeSupabaseClient(tables),
        whatsapp_service=FakeWhatsAppService(),
    )

    check_in = AthleteCheckIn(
        athlete_id="athlete-123",
        readiness=41,
        hrv="below",
        sleep_hours=6.0,
        sleep_quality="poor",
        soreness=8,
    )
    recommendation = CheckInRecommendation(
        recommended_action="recovery",
        rationale="HRV is below baseline and soreness is high.",
    )



    result = await service.process_check_in_submission(check_in, recommendation)

    assert result.scanned == 1
    assert len(result.findings) == 1
    assert result.dashboard_written == 1
    assert result.whatsapp_sent == 1
    assert tables["coach_alerts"].inserted[0]["athlete_id"] == "athlete-123"
    assert "low HRV" in tables["coach_alerts"].inserted[0]["summary"]
    assert len(tables["coach_alert_notifications"].inserted) == 1
    assert len(service.whatsapp_service.sent) == 1  # type: ignore[attr-defined]
    assert "proactive alert" in service.whatsapp_service.sent[0]["body"]  # type: ignore[index]


async def test_run_scans_latest_check_in_row_per_athlete() -> None:
    tables = {
        "memory_states": FakeTable(
            [
                {
                    "id": "old-row",
                    "athlete_id": "athlete-123",
                    "state_type": "athlete_check_in",
                    "check_in": {"hrv": "below", "soreness": 9, "missed_workouts": 1},
                    "updated_at": "2026-04-12T10:00:00+00:00",
                },
                {
                    "id": "latest-row",
                    "athlete_id": "athlete-123",
                    "state_type": "athlete_check_in",
                    "check_in": {"hrv": "normal", "soreness": 2, "missed_workouts": 0},
                    "updated_at": "2026-04-13T10:00:00+00:00",
                },
                {
                    "id": "athlete-456-row",
                    "athlete_id": "athlete-456",
                    "state_type": "athlete_check_in",
                    "check_in": {"hrv": "below", "soreness": 7, "missed_workouts": 2},
                    "updated_at": "2026-04-13T09:00:00+00:00",
                },
            ]
        ),
        "coaches": FakeTable([]),
        "coach_alerts": FakeTable([]),
        "coach_alert_notifications": FakeTable([]),
    }
    service = AlertService(supabase_client=FakeSupabaseClient(tables), whatsapp_service=None)



    result = await service.run(now=datetime(2026, 4, 13, tzinfo=timezone.

    assert result.scanned == 3
    assert len(result.findings) == 1
    assert result.findings[0].athlete_id == "athlete-456"
    assert tables["coach_alerts"].inserted[0]["athlete_id"] == "athlete-456"



async def test_assess_check_in_uses_biological_baseline_for_recovery_expectations() -> None:
    check_in = AthleteCheckIn(
        athlete_id="athlete-123",
        readiness=77,
        hrv="normal",
        sleep_hours=7.5,
        sleep_quality="good",
        soreness=2,
        biological_baseline={
            "age_years": 46,
            "training_age_years": 1,
            "blood_work": {
                "markers": {"ferritin": "low"},
                "notes": ["Recent labs suggest constrained iron stores"],
            },
            "dna": {
                "markers": {"recovery_profile": "slow"},
                "notes": ["Genetic panel flags slower recovery response"],
            },
        },
    )



    recommendation = await 
        assess_check_in(
            check_in,
            observed_at=datetime(2026, 4, 13, tzinfo=timezone.utc),
        )
    )

    assert recommendation.recommended_action == "recovery"
    assert recommendation.baseline_adjustments
    assert recommendation.recovery_expectation is not None
    assert recommendation.fatigue_expectation is not None
    assert "biological baseline" in recommendation.rationale.lower()
