from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api.v1 import routes as v1_routes
from app.main import app
from app.services.athletememorysearch import AthleteMemorySearch


client = TestClient(app)


class FakeTable:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    async def execute(self):
        rows = self.rows
        if "athlete_id" in self.filters:
            rows = [row for row in rows if row.get("athlete_id") == self.filters["athlete_id"]]
        return {"data": rows}


class FakeSupabase:
    def __init__(self, rows):
        self.rows = rows

    async def table(self, name):
        assert name == "memory_states"
        return FakeTable(self.rows)


def test_athlete_memory_search_ranks_relevant_rows() -> None:
    now = datetime.now(timezone.utc)
    service = AthleteMemorySearch(
        FakeSupabase(
            [
                {
                    "id": "state-1",
                    "athlete_id": "athlete-1",
                    "state_type": "check_in",
                    "updated_at": now.isoformat(),
                    "summary": "Easy day after threshold workout",
                    "payload": {"notes": "threshold workout was hard"},
                },
                {
                    "id": "state-2",
                    "athlete_id": "athlete-1",
                    "state_type": "nutrition",
                    "updated_at": now.isoformat(),
                    "summary": "Race week carb load",
                    "payload": {"notes": "focus on recovery"},
                },
            ]
        )
    )

    # Exercise the service directly for ranking behavior.
    import asyncio

    search_result = asyncio.run(service.search("athlete-1", "threshold workout", limit=2))

    assert search_result.athlete_id == "athlete-1"
    assert search_result.used_fallback is False
    assert [hit.memory_state_id for hit in search_result.matches] == ["state-1"]
    assert "threshold workout" in search_result.matches[0].snippet.lower()


def test_athlete_memory_search_endpoint(monkeypatch) -> None:
    @dataclass
    class FakeHit:
        memory_state_id: str = "state-9"
        athlete_id: str = "athlete-1"
        state_type: str = "check_in"
        updated_at: str = "2026-04-13T05:00:00+00:00"
        score: float = 91.2
        summary: str = "Threshold workout note"
        snippet: str = "threshold workout note"
        memory_state: dict[str, object] = None

    @dataclass
    class FakeResult:
        athlete_id: str
        query: str
        total_scanned: int
        used_fallback: bool
        matches: list[FakeHit]

    class FakeService:
        def __init__(self, supabase_client):
            self.supabase_client = supabase_client

        async def search(self, athlete_id: str, query: str | None, limit: int = 5):
            return FakeResult(
                athlete_id=athlete_id,
                query=query or "",
                total_scanned=1,
                used_fallback=False,
                matches=[FakeHit(memory_state={"notes": "threshold workout note"})],
            )

    monkeypatch.setattr(v1_routes, "AthleteMemorySearch", FakeService)
    app.state.supabase_client = object()

    response = client.post(
        "/api/v1/athlete-memory-search",
        json={"athlete_id": "athlete-1", "query": "threshold", "limit": 3},
    )

    assert response.status_code == 200
    assert response.json() == {
        "athlete_id": "athlete-1",
        "query": "threshold",
        "total_scanned": 1,
        "used_fallback": False,
        "matches": [
            {
                "memory_state_id": "state-9",
                "athlete_id": "athlete-1",
                "state_type": "check_in",
                "updated_at": "2026-04-13T05:00:00+00:00",
                "score": 91.2,
                "summary": "Threshold workout note",
                "snippet": "threshold workout note",
                "memory_state": {"notes": "threshold workout note"},
            }
        ],
    }
