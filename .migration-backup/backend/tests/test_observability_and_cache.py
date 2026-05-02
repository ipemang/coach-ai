from __future__ import annotations

from datetime import date
from typing import Any

from fastapi.testclient import TestClient

from app.agents.check_in import CheckInRecommendation
from app.api.v1 import routes as v1_routes
from app.core import security as security_module
from app.core.rate_limit import RateLimiter
from app.main import app
from app.services.biometrics import BiometricsService, ProviderAuthResult


class FakeRedisCacheClient:
    def __init__(self) -> None:
        self.values: dict[str, Any] = {}

    async def get(self, key: str) -> Any:
        return self.values.get(key)

    async def setex(self, key: str, _ttl: int, value: Any) -> Any:
        self.values[key] = value
        return True


class CountingAdapter:
    provider = "garmin"

    def __init__(self) -> None:
        self.primary_biometrics_calls = 0

    async def authenticate(self, context):  # pragma: no cover - not used in this test
        return ProviderAuthResult(
            provider=context.provider,
            athlete_id=context.athlete_id,
            access_token="token",
        )

    async def fetch_garmin_workout_summaries(self, athlete_id, day, auth):  # pragma: no cover - not used
        return []

    async def fetch_garmin_primary_biometrics(self, athlete_id, day, auth):
        self.primary_biometrics_calls += 1
        return {"resting_hr_bpm": 42, "source_record_ids": ["record-1"]}

    async def fetch_strava_activity_sync(self, athlete_id, day, auth):  # pragma: no cover - not used
        return []

    async def fetch_strava_segment_data(self, athlete_id, day, auth):  # pragma: no cover - not used
        return []

    async def fetch_oura_readiness(self, athlete_id, day, auth):  # pragma: no cover - not used
        return None

    async def fetch_oura_hrv(self, athlete_id, day, auth):  # pragma: no cover - not used
        return None

    async def fetch_oura_sleep_quality(self, athlete_id, day, auth):  # pragma: no cover - not used
        return None


class DummyAuth:
    provider = "garmin"

    def __init__(self) -> None:
        self.athlete_id = "athlete-1"


def test_rate_limiter_enforces_request_limit(monkeypatch) -> None:
    app.state.rate_limiter = RateLimiter(None, limit=1, window_seconds=60)
    monkeypatch.setattr(
        v1_routes,
        "assess_check_in",
        lambda payload: CheckInRecommendation(recommended_action="continue planned session", rationale="Looks good."),
    )
    monkeypatch.setattr(v1_routes, "persist_check_in_state", lambda payload, recommendation, **kwargs: True)

    async def fake_authenticate_request(_request):
        return security_module.AuthenticatedPrincipal(
            user_id="user-123",
            email="coach@example.com",
            roles=frozenset({"authenticated", "athlete", "coach"}),
            organization_id="org-1",
            coach_id="coach-123",
        )

    monkeypatch.setattr(security_module, "authenticate_request", fake_authenticate_request)
    client = TestClient(app)
    first = client.post(
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
    second = client.post(
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
    assert first.status_code == 200
    assert first.headers.get("x-request-id")
    assert second.status_code == 429
    assert second.json() == {"detail": "Rate limit exceeded"}
    assert second.headers.get("retry-after") is not None


def test_biometric_lookup_uses_cache() -> None:
    adapter = CountingAdapter()
    cache_client = FakeRedisCacheClient()
    service = BiometricsService(
        provider_adapters={"garmin": adapter},
        cache_client=cache_client,
    )
    auth = ProviderAuthResult(provider="garmin", athlete_id="athlete-1", access_token="token")
    import asyncio
    first = asyncio.run(service.fetch_garmin_primary_biometrics("athlete-1", date(2026, 4, 13), auth))
    second = asyncio.run(service.fetch_garmin_primary_biometrics("athlete-1", date(2026, 4, 13), auth))
    assert first == second
    assert adapter.primary_biometrics_calls == 1
