from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.services.athlete_memory_search import AthleteMemorySearchService
from app.services.scope import DataScope
from app.main import app
from app.core import security as security_module


class FakeQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows
        self._eq_filters: list[tuple[str, Any]] = []
        self._in_filters: list[tuple[str, list[Any]]] = []
        self._limit: int | None = None

    def select(self, *_args: Any, **_kwargs: Any) -> "FakeQuery":
        return self

    def eq(self, field: str, value: Any) -> "FakeQuery":
        self._eq_filters.append((field, value))
        return self

    def in_(self, field: str, values: list[Any]) -> "FakeQuery":
        self._in_filters.append((field, values))
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> "FakeQuery":
        return self

    def limit(self, value: int) -> "FakeQuery":
        self._limit = value
        return self

    async def execute(self) -> dict[str, Any]:
        rows = list(self._rows)
        for field, value in self._eq_filters:
            rows = [row for row in rows if row.get(field) == value]
        for field, values in self._in_filters:
            rows = [row for row in rows if row.get(field) in values]
        if self._limit is not None:
            rows = rows[: self._limit]
        return {"data": rows}


class FakeSupabaseClient:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    async def table(self, name: str) -> FakeQuery:
        assert name == "memory_states"
        return FakeQuery(self._rows)


def test_memory_search_service_prefers_recent_relevant_memory() -> None:
    rows = [
        {
            "id": "old-match",
            "athlete_id": "athlete-123",
            "athlete_name": "Sam",
            "state_type": "check_in",
            "summary": "Achilles pain after long run",
            "rationale": "Athlete reported pain on the outside of the heel and needed recovery.",
            "updated_at": "2026-03-01T09:00:00+00:00",
            "payload": {"notes": "Pain improved after rest"},
        },
        {
            "id": "recent-match",
            "athlete_id": "athlete-123",
            "athlete_name": "Sam",
            "state_type": "check_in",
            "summary": "Achilles still sore but improving",
            "rationale": "Recent update after an easier week and mobility work.",
            "updated_at": "2026-04-12T09:00:00+00:00",
            "payload": {"notes": "Would like the next session to stay aerobic"},
        },
        {
            "id": "irrelevant-recent",
            "athlete_id": "athlete-123",
            "athlete_name": "Sam",
            "state_type": "check_in",
            "summary": "Bike fit follow-up",
            "updated_at": "2026-02-01T09:00:00+00:00",
            "payload": {"notes": "Saddle position looks good"},
        },
    ]

    service = AthleteMemorySearchService(FakeSupabaseClient(rows), scope=DataScope(organization_id="org-1", coach_id="coach-1"))

    import asyncio

    result = asyncio.run(
        service.search("latest Achilles pain update", athlete_id="athlete-123", limit=2, now=datetime(2026, 4, 13, tzinfo=timezone.utc))
    )

    assert [item.memory_state_id for item in result] == ["recent-match", "old-match"]
    assert result[0].score >= result[1].score
    assert "achilles" in result[0].matched_terms
    assert result[0].excerpt is not None


def test_memory_search_endpoint_returns_ranked_context(monkeypatch) -> None:
    async def _fake_coach_principal(_request):
        from app.core.security import AuthenticatedPrincipal
        return AuthenticatedPrincipal(
            user_id="user-1",
            email="coach@example.com",
            roles=frozenset({"authenticated", "coach"}),
            organization_id="org-1",
            coach_id="coach-1",
        )

    monkeypatch.setattr(security_module, "authenticate_request", _fake_coach_principal)
    app.state.supabase_client = FakeSupabaseClient(
        [
            {
                "id": "memory-1",
                "athlete_id": "athlete-123",
                "athlete_name": "Sam",
                "state_type": "check_in",
                "summary": "Hard run left the athlete tired",
                "updated_at": "2026-04-12T09:00:00+00:00",
                "payload": {"notes": "Sleep was short but HRV was okay"},
            }
        ]
    )

    client = TestClient(app)
    response = client.post(
        "/athlete-memory/search",
        json={
            "query": "sleep and HRV",
            "organization_id": "org-1",
            "coach_id": "coach-1",
            "athlete_id": "athlete-123",
            "limit": 3,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "sleep and HRV"
    assert body["result_count"] == 1
    assert body["results"][0]["memory_state_id"] == "memory-1"
    assert "sleep" in body["context"].lower()
