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
        "baseline_adjustments": [],
        "recovery_expectation": None,
        "fatigue_expectation": None,
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

from app.api.v1 import invites as invites_module


class _FakeTable:
    def __init__(self, name: str, db: dict[str, list[dict]]):
        self.name = name
        self.db = db
        self._filters: list[tuple[str, object]] = []
        self._mode = "select"
        self._payload: dict[str, object] | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column: str, value: object):
        self._filters.append((column, value))
        return self

    def update(self, payload: dict[str, object]):
        self._mode = "update"
        self._payload = payload
        return self

    def upsert(self, payload: dict[str, object]):
        self._mode = "upsert"
        self._payload = payload
        return self

    async def execute(self):
        rows = self.db.setdefault(self.name, [])

        def matches(row: dict[str, object]) -> bool:
            return all(str(row.get(column)) == str(value) for column, value in self._filters)

        if self._mode == "select":
            return {"data": [row.copy() for row in rows if matches(row)]}

        if self._payload is None:
            return {"data": []}

        updated_rows: list[dict[str, object]] = []
        for index, row in enumerate(rows):
            if matches(row):
                rows[index] = {**row, **self._payload}
                updated_rows.append(rows[index].copy())

        if self._mode == "upsert" and not updated_rows:
            new_row = self._payload.copy()
            rows.append(new_row)
            updated_rows.append(new_row.copy())

        return {"data": updated_rows}


class _FakeSupabaseClient:
    def __init__(self, db: dict[str, list[dict]]):
        self.db = db

    async def table(self, name: str):
        return _FakeTable(name, self.db)


class _FakeSettings:
    supabase_service_role_key = "test-secret"


def test_invite_generation_and_resolution(monkeypatch) -> None:
    db = {
        "coaches": [
            {"id": "coach-row-1", "coach_id": "coach-123", "organization_id": "org-1", "name": "Coach One"},
        ],
        "athletes": [
            {"id": "athlete-7", "athlete_id": "athlete-7", "display_name": "Jordan", "coach_id": None, "organization_id": None},
        ],
    }
    app.state.supabase_client = _FakeSupabaseClient(db)
    monkeypatch.setattr(invites_module, "get_settings", lambda: _FakeSettings())

    first = client.post(
        "/api/v1/invites",
        json={"coach_id": "coach-123", "organization_id": "org-1", "expires_in_days": 7},
    )
    second = client.post(
        "/api/v1/invites",
        json={"coach_id": "coach-123", "organization_id": "org-1", "expires_in_days": 7},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    first_body = first.json()
    second_body = second.json()
    assert first_body["invite_id"] != second_body["invite_id"]
    assert first_body["invite_token"] != second_body["invite_token"]
    assert first_body["invite_url"].startswith("http://testserver/api/v1/invites/resolve?token=")

    resolve = client.post(
        "/api/v1/invites/resolve",
        json={
            "invite_token": first_body["invite_token"],
            "athlete_id": "athlete-7",
            "athlete_name": "Jordan",
        },
    )

    assert resolve.status_code == 200
    resolve_body = resolve.json()
    assert resolve_body["roster_updated"] is True
    assert resolve_body["coach_id"] == "coach-123"
    assert resolve_body["organization_id"] == "org-1"
    assert resolve_body["athlete_record"]["coach_id"] == "coach-123"
    assert resolve_body["athlete_record"]["organization_id"] == "org-1"
    assert db["athletes"][0]["coach_id"] == "coach-123"
    assert db["athletes"][0]["organization_id"] == "org-1"
