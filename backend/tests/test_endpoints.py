from __future__ import annotations

from app.api import coach as coach_module
from app.api.v1 import routes as v1_routes
from app.agents.check_in import CheckInRecommendation
from app.main import app
from app.services.coach_workflow import CoachTriageItem
from fastapi.testclient import TestClient


client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_check_in_endpoint(monkeypatch) -> None:
    called = {}

    def fake_assess_check_in(payload):
        called["athlete_id"] = payload.athlete_id
        return CheckInRecommendation(
            recommended_action="continue planned session",
            rationale="Looks good.",
        )

    def fake_persist_check_in_state(payload, recommendation):
        called["persisted"] = (payload.athlete_id, recommendation.recommended_action)
        return True

    monkeypatch.setattr(v1_routes, "assess_check_in", fake_assess_check_in)
    monkeypatch.setattr(v1_routes, "persist_check_in_state", fake_persist_check_in_state)

    response = client.post(
        "/check-in",
        json={
            "athlete_id": "athlete-123",
            "readiness": 82,
            "hrv": "normal",
            "sleep_hours": 7.5,
            "sleep_quality": "good",
            "soreness": 2,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "recommended_action": "continue planned session",
        "rationale": "Looks good.",
    }
    assert called["athlete_id"] == "athlete-123"
    assert called["persisted"] == ("athlete-123", "continue planned session")


def test_triage_endpoint(monkeypatch) -> None:
    app.state.supabase_client = object()
    app.state.whatsapp_service = None

    expected_item = CoachTriageItem(
        athlete_id="athlete-123",
        athlete_name="Sam",
        urgency_score=78.0,
        urgency_label="critical",
        latest_memory_state_id="state-456",
        latest_memory_state_at="2026-04-13T05:00:00+00:00",
        hrv_flag="low",
        soreness_score=8.0,
        missed_workouts=2,
        reasons=["HRV flag indicates low", "Soreness score 8", "2 missed workouts"],
        memory_state={"hrv_flag": "low"},
    )

    class FakeWorkflow:
        def __init__(self, *, supabase_client, whatsapp_service):
            self.supabase_client = supabase_client
            self.whatsapp_service = whatsapp_service

        async def build_triage(self):
            return [expected_item]

    monkeypatch.setattr(coach_module, "CoachWorkflow", FakeWorkflow)

    response = client.get("/api/v1/coach/triage")

    assert response.status_code == 200
    assert response.json() == [
        {
            "athlete_id": "athlete-123",
            "athlete_name": "Sam",
            "urgency_score": 78.0,
            "urgency_label": "critical",
            "latest_memory_state_id": "state-456",
            "latest_memory_state_at": "2026-04-13T05:00:00+00:00",
            "hrv_flag": "low",
            "soreness_score": 8.0,
            "missed_workouts": 2,
            "reasons": ["HRV flag indicates low", "Soreness score 8", "2 missed workouts"],
            "memory_state": {"hrv_flag": "low"},
        }
    ]
