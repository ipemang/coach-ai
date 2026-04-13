from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import asyncio
from types import SimpleNamespace
from typing import Any

from app.services.coach_workflow import CoachWorkflow
from app.services.predictive_analysis import PredictiveAnalysisService
from app.services.scope import DataScope


@dataclass
class FakeFlag:
    code: str
    label: str
    priority: str
    score: float
    confidence: float
    reason: str
    evidence: list[str]
    weather_adjusted: bool = False


class FakeMemorySearchService:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def build_context(self, query: str, *, athlete_id: str | None = None, limit: int = 5, state_types: list[str] | None = None):
        self.calls.append({"query": query, "athlete_id": athlete_id, "limit": limit, "state_types": state_types})
        return [SimpleNamespace(memory_state={"summary": "tight calves and rising fatigue", "note": "flagged pain"})], "Recent memory: tight calves, higher fatigue, and sleep disruption."


class FakeWeatherService:
    def fetch_observation(self, latitude: float, longitude: float, at: datetime):
        if at.date().isoformat() == "2026-04-13":
            return SimpleNamespace(temperature_c=31.0, humidity_percent=82.0, observed_at="2026-04-13T10:00:00Z")
        return SimpleNamespace(temperature_c=16.0, humidity_percent=45.0, observed_at="2026-04-12T10:00:00Z")


class FakeQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def select(self, *_args: Any, **_kwargs: Any) -> "FakeQuery":
        return self

    async def execute(self) -> dict[str, Any]:
        return {"data": [row.copy() for row in self.rows]}


class FakeSupabaseClient:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self.tables = tables

    async def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.tables.get(name, []))


def test_predictive_analysis_flags_aerobic_efficiency_drop_with_weather_normalization() -> None:
    rows = [
        {
            "id": "latest-activity",
            "athlete_id": "athlete-123",
            "athlete_display_name": "Jordan Lee",
            "state_type": "activity_summary",
            "started_at": "2026-04-13T10:00:00+00:00",
            "avg_hr_bpm": 155,
            "distance_meters": 5000,
            "moving_time_seconds": 1500,
            "latitude": 40.7128,
            "longitude": -74.0060,
            "sleep_hours": 6.4,
            "hrv_ms": 41,
            "soreness": 7,
            "fatigue_score": 8,
            "mood_score": 4,
        },
        {
            "id": "baseline-1",
            "athlete_id": "athlete-123",
            "state_type": "activity_summary",
            "started_at": "2026-04-12T10:00:00+00:00",
            "avg_hr_bpm": 140,
            "distance_meters": 5000,
            "moving_time_seconds": 1450,
            "latitude": 40.7128,
            "longitude": -74.0060,
            "sleep_hours": 7.5,
            "hrv_ms": 55,
            "soreness": 3,
            "fatigue_score": 3,
            "mood_score": 7,
        },
        {
            "id": "baseline-2",
            "athlete_id": "athlete-123",
            "state_type": "activity_summary",
            "started_at": "2026-04-11T10:00:00+00:00",
            "avg_hr_bpm": 138,
            "distance_meters": 5000,
            "moving_time_seconds": 1460,
            "latitude": 40.7128,
            "longitude": -74.0060,
            "sleep_hours": 7.2,
            "hrv_ms": 57,
            "soreness": 2,
            "fatigue_score": 3,
            "mood_score": 7,
        },
    ]

    service = PredictiveAnalysisService(
        supabase_client=FakeSupabaseClient({"memory_states": rows}),
        memory_search_service=FakeMemorySearchService(),
        weather_service=FakeWeatherService(),
        scope=DataScope(organization_id="org-1", coach_id="coach-1"),
    )

    result = asyncio.run(service.analyze_athlete("athlete-123", rows))

    assert result.athlete_id == "athlete-123"
    assert result.summary is not None
    assert result.flags[0].code == "aerobic_efficiency_drop"
    assert result.flags[0].weather_adjusted is True
    assert "heart rate" in result.flags[0].reason.lower()
    assert "tight calves" in result.memory_context.lower()
    assert result.weather_context["latest-activity"]["temperature_c"] == 31.0
    assert service.memory_search_service.calls[0]["athlete_id"] == "athlete-123"  # type: ignore[attr-defined]


class FakePredictiveService:
    async def analyze_athlete(self, athlete_id: str, rows: list[dict[str, Any]], *, now: datetime | None = None):
        return SimpleNamespace(
            athlete_id=athlete_id,
            athlete_name="Jordan Lee",
            latest_memory_state_id="state-1",
            latest_memory_state_at="2026-04-13T10:00:00+00:00",
            summary="Aerobic efficiency drop: Athlete is producing the same or lower pace/power with a higher heart rate after weather normalization.",
            flags=[FakeFlag(code="aerobic_efficiency_drop", label="Aerobic efficiency drop", priority="high", score=92.0, confidence=0.88, reason="Athlete is producing the same or lower pace/power with a higher heart rate after weather normalization.", evidence=["Weather-adjusted efficiency dropped 12.0%"], weather_adjusted=True)],
            memory_context="Recent memory: tight calves, higher fatigue, and sleep disruption.",
            memory_results=[],
            weather_context={},
        )


class FakeTable:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def select(self, *_args: Any, **_kwargs: Any) -> "FakeTable":
        return self

    async def execute(self) -> dict[str, Any]:
        return {"data": [row.copy() for row in self.rows]}


class FakeWorkflowSupabase:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    async def table(self, name: str) -> FakeTable:
        return FakeTable(self.rows)


def test_coach_workflow_includes_predicted_state_flags_in_triage_item() -> None:
    rows = [
        {
            "id": "latest-activity",
            "athlete_id": "athlete-123",
            "athlete_display_name": "Jordan Lee",
            "state_type": "activity_summary",
            "updated_at": "2026-04-13T10:00:00+00:00",
            "avg_hr_bpm": 155,
            "distance_meters": 5000,
            "moving_time_seconds": 1500,
            "soreness": 7,
            "hrv_flag": "low",
            "missed_workouts": 0,
        }
    ]
    workflow = CoachWorkflow(
        supabase_client=FakeWorkflowSupabase(rows),
        whatsapp_service=None,
        scope=DataScope(organization_id="org-1", coach_id="coach-1"),
        predictive_analysis_service=FakePredictiveService(),
    )

    triage = asyncio.run(workflow.build_triage())

    assert len(triage) == 1
    item = triage[0]
    assert item.predicted_state_summary is not None
    assert item.predicted_state_flags[0].code == "aerobic_efficiency_drop"
    assert any("Aerobic efficiency drop" in reason for reason in item.reasons)
